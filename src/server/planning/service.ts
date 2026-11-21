import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { MealType, PlanningProfile, RecipeLite, TagAffinity } from "@/types";
import { chooseRecipe, type Choice } from "../ai/adapter";
import { takeAiBudget } from "../ai/rate-limit";
import { getAffinity, recordSignal } from "../adherence/service";
import { topTags } from "../adherence/affinity";
import { HttpError } from "../auth/require-user";
import { prisma } from "../db/prisma";
import { normalizeAllergies } from "./allergens";
import { filterRecipes, ingredientsHaveAllergen } from "./filter";
import { generatePlan, MEAL_SHARE } from "./generate-plan";
import { MEAL_TAGS } from "./meal-types";
import { rankRecipes } from "./rank";
import { ingredientNamesOf, modificationFits, namesBreakRules, recipeFits } from "./safety";
import { applyWish, ingredientsMentionAvoided, searchTerms, type ParsedWish, parseWish } from "./wish";
import { addDays, isoOf, mondayOf, toDate, todayIso } from "./week";

/** Columns the planner needs. No steps or ingredients, which keeps candidate loads light. */
const RECIPE_SELECT = {
  id: true, name: true, calories: true, proteinG: true, carbsG: true, fatG: true,
  tags: true, equipment: true, allergens: true, diets: true,
} as const;

/** Recipes the user had in this many previous weeks are skipped when planning. */
const RECENT_WEEKS = 3;
/** Candidates sent to the AI to choose from. */
const SHORTLIST_SIZE = 8;
/** Calorie window around the meal target, widened step by step if too few recipes match. */
const CALORIE_WINDOWS = [0.2, 0.4, 0.8];
const MIN_POOL = 20;
/** With a text request even a handful of matches is enough, so the calorie window stops widening sooner. */
const MIN_WISH_POOL = 6;
/** How many of the best-ranked recipes get their real ingredient lists checked for allergens and avoided words. */
const INGREDIENT_CHECK_SIZE = 60;

export interface UserPlanningContext extends PlanningProfile {
  equipment: string[];
  cuisines: string[];
}

export async function getPlanningContext(userId: string): Promise<UserPlanningContext> {
  const p = await prisma.profile.findUnique({ where: { id: userId } });
  if (!p || !p.calorieTarget) throw new HttpError(409, "Finish onboarding first");
  return {
    diet: p.diet,
    allergies: p.allergies,
    calorieTarget: p.calorieTarget,
    equipment: p.equipment,
    cuisines: p.cuisines,
  };
}

/** Learned tag scores plus a gentle boost for the cuisines chosen at onboarding. */
export async function getTasteScores(userId: string, cuisines: string[]): Promise<TagAffinity> {
  const learned = await getAffinity(userId);
  const scores: TagAffinity = { ...learned };
  for (const c of cuisines) scores[c] = (scores[c] ?? 0) + 1;
  return scores;
}

/**
 * Recipes the user may see (shared ones and their own AI recipes) that pass allergy, diet and
 * meal-type filters and sit near the meal's calorie target. Filters run in SQL so we never
 * load the whole table; they are applied again in code as a second check.
 */
export async function loadCandidates(
  userId: string,
  profile: PlanningProfile,
  mealType: MealType,
  excludeIds: string[] = [],
  wish: ParsedWish | null = null,
): Promise<RecipeLite[]> {
  const target = profile.calorieTarget * MEAL_SHARE[mealType];
  const allergies = normalizeAllergies(profile.allergies);
  const diet = profile.diet?.trim().toLowerCase();
  // With a request, only recipes whose name or tags mention a wanted word are loaded, so
  // "something Thai" is found even if no Thai recipe is among the closest in calories.
  const wanted = wish && wish.want.length > 0 ? searchTerms(wish) : null;
  const minPool = wanted ? MIN_WISH_POOL : MIN_POOL;

  let rows: RecipeLite[] = [];
  for (const w of CALORIE_WINDOWS) {
    rows = await prisma.recipe.findMany({
      where: {
        AND: [
          { OR: [{ ownerId: null }, { ownerId: userId }] },
          ...(wanted
            ? [{ OR: [...wanted.stems.map((t) => ({ name: { contains: t, mode: "insensitive" as const } })), { tags: { hasSome: wanted.tags } }] }]
            : []),
        ],
        calories: { gte: target * (1 - w), lte: target * (1 + w) },
        tags: { hasSome: MEAL_TAGS[mealType] },
        ...(allergies.length ? { NOT: { allergens: { hasSome: allergies } } } : {}),
        ...(diet ? { diets: { has: diet } } : {}),
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      },
      select: RECIPE_SELECT,
      take: 2000,
    });
    if (rows.length >= minPool) break;
  }
  return filterRecipes(rows, profile);
}

async function recentRecipeIds(userId: string, weekStart: string): Promise<string[]> {
  const rows = await prisma.planEntry.findMany({
    where: { userId, date: { gte: toDate(addDays(weekStart, -7 * RECENT_WEEKS)), lt: toDate(weekStart) } },
    select: { recipeId: true },
  });
  return [...new Set(rows.map((r) => r.recipeId))];
}

// ---------- shapes returned to the client ----------

const entryInclude = {
  recipe: { select: { id: true, name: true, calories: true, proteinG: true, carbsG: true, fatG: true, tags: true, equipment: true } },
} satisfies Prisma.PlanEntryInclude;

type EntryRow = Prisma.PlanEntryGetPayload<{ include: typeof entryInclude }>;

export function formatEntry(e: EntryRow) {
  return {
    id: e.id,
    date: isoOf(e.date),
    mealType: e.mealType,
    position: e.position,
    recipe: e.recipe,
    converted: e.convertedSteps.length > 0,
    modified: e.modifiedRecipe !== null,
  };
}

function formatPlan(plan: { id: string; weekStart: Date; calorieTarget: number; entries: EntryRow[] }) {
  const entries = [...plan.entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.position - b.position,
  );
  return {
    id: plan.id,
    weekStart: isoOf(plan.weekStart),
    calorieTarget: plan.calorieTarget,
    entries: entries.map(formatEntry),
  };
}

const planInclude = { entries: { include: entryInclude } } satisfies Prisma.WeeklyPlanInclude;

// ---------- weekly plan ----------

/** The user's plan for the week containing `date` (default: this week), or null. */
export async function getWeekPlan(userId: string, date?: string) {
  const weekStart = mondayOf(date ?? todayIso());
  const where = { userId_weekStart: { userId, weekStart: toDate(weekStart) } };
  let plan = await prisma.weeklyPlan.findUnique({ where, include: planInclude });
  if (plan && plan.entries.length > 0) {
    if ((await repairUnsafeEntries(userId, plan.id, await getPlanningContext(userId))) > 0) {
      plan = await prisma.weeklyPlan.findUnique({ where, include: planInclude });
    }
  }
  return plan ? formatPlan(plan) : null;
}

/**
 * Plan a full week of dinners (one recipe per day). Returns the existing plan unless
 * `regenerate` is set. Picks come from code-based filtering and ranking, so this never calls the AI.
 */
export async function createWeekPlan(userId: string, date?: string, regenerate = false) {
  const weekStart = mondayOf(date ?? todayIso());
  const where = { userId_weekStart: { userId, weekStart: toDate(weekStart) } };

  const existing = await prisma.weeklyPlan.findUnique({ where, include: planInclude });
  const ctx = await getPlanningContext(userId);
  if (existing && existing.entries.length > 0 && !regenerate) {
    // Same plan as before, but meals that no longer fit the user's current rules are replaced first.
    if ((await repairUnsafeEntries(userId, existing.id, ctx)) === 0) return formatPlan(existing);
    return formatPlan(await prisma.weeklyPlan.findUniqueOrThrow({ where, include: planInclude }));
  }

  const [recent, taste] = await Promise.all([
    recentRecipeIds(userId, weekStart),
    getTasteScores(userId, ctx.cuisines),
  ]);
  const candidates = await loadCandidates(userId, ctx, "dinner", recent);
  // Rank first, then keep only recipes whose real ingredients are safe (see dropUnsafeByIngredients).
  const recipes = await dropUnsafeByIngredients(
    rankRecipes(candidates, { targetCalories: ctx.calorieTarget * MEAL_SHARE.dinner, affinity: taste }),
    ctx,
    null,
  );

  const days = generatePlan({
    recipes,
    profile: ctx,
    startDate: weekStart,
    days: 7,
    affinity: taste,
    seed: regenerate ? `${userId}:${weekStart}:${Date.now()}` : `${userId}:${weekStart}`,
  });
  if (days.length === 0) throw new HttpError(422, "No recipes match your diet and allergies");

  const plan = await prisma.$transaction(async (tx) => {
    const wp = await tx.weeklyPlan.upsert({
      where,
      create: { userId, weekStart: toDate(weekStart), calorieTarget: ctx.calorieTarget },
      update: { calorieTarget: ctx.calorieTarget },
    });
    await tx.planEntry.deleteMany({ where: { planId: wp.id } });
    await tx.planEntry.createMany({
      data: days.map((d) => ({
        userId, planId: wp.id, recipeId: d.recipeId, date: toDate(d.date), mealType: d.mealType, position: 0,
      })),
    });
    return tx.weeklyPlan.findUniqueOrThrow({ where: { id: wp.id }, include: planInclude });
  });
  return formatPlan(plan);
}

// ---------- daily recommendation ----------

async function shortlistFor(
  userId: string,
  ctx: UserPlanningContext,
  mealType: MealType,
  excludeIds: string[],
  wish: ParsedWish | null = null,
) {
  const [pool, taste] = await Promise.all([
    loadCandidates(userId, ctx, mealType, excludeIds, wish),
    getTasteScores(userId, ctx.cuisines),
  ]);
  const targetCalories = ctx.calorieTarget * MEAL_SHARE[mealType];
  let ranked = rankRecipes(pool, { targetCalories, affinity: taste });

  if (wish) ranked = applyWish(ranked, wish);
  ranked = await dropUnsafeByIngredients(ranked, ctx, wish);
  return { shortlist: ranked.slice(0, SHORTLIST_SIZE), targetCalories, taste };
}

/**
 * Second safety net on the best-ranked recipes, using their real ingredient lists. The recipe tags
 * can be wrong (a tortellini recipe with no allergens listed, a "vegetarian" recipe with bacon), so
 * a recipe is dropped when any ingredient name triggers one of the user's allergens, breaks their
 * diet, or mentions a word they asked to avoid.
 */
async function dropUnsafeByIngredients(
  ranked: RecipeLite[],
  profile: { allergies: string[]; diet?: string | null },
  wish: ParsedWish | null,
): Promise<RecipeLite[]> {
  const head = ranked.slice(0, INGREDIENT_CHECK_SIZE);
  if (head.length === 0) return head;
  const rows = await prisma.recipe.findMany({
    where: { id: { in: head.map((r) => r.id) } },
    select: { id: true, ingredients: true },
  });
  const bad = new Set(
    rows
      .filter((r) => {
        const names = ingredientNamesOf(r.ingredients);
        return namesBreakRules(names, profile) || (wish ? ingredientsMentionAvoided(names, wish) : false);
      })
      .map((r) => r.id),
  );
  return head.filter((r) => !bad.has(r.id));
}

/**
 * Meals in a plan were chosen under the user's rules at the time. If they later change their
 * allergies or diet (for example by redoing onboarding), meals that no longer fit must not stay.
 * Each remaining meal from today on that breaks the current rules is replaced with the best safe
 * recipe (no AI involved); if only the user's AI modification is the problem it is undone; if
 * nothing safe exists the meal is removed. Past days are history and are left alone.
 * Returns how many meals were changed.
 */
export async function repairUnsafeEntries(userId: string, planId: string, ctx: UserPlanningContext): Promise<number> {
  const entries = await prisma.planEntry.findMany({
    where: { planId, userId },
    select: {
      id: true, date: true, mealType: true, recipeId: true, modifiedRecipe: true,
      recipe: { select: { allergens: true, diets: true, ingredients: true } },
    },
  });
  const today = todayIso();
  const broken = entries.filter(
    (e) => isoOf(e.date) >= today && (!recipeFits(e.recipe, ctx) || !modificationFits(e.modifiedRecipe, ctx)),
  );
  if (broken.length === 0) return 0;

  const used = new Set(entries.map((e) => e.recipeId));
  for (const e of broken) {
    if (recipeFits(e.recipe, ctx)) {
      // Only the user's own modification is the problem: go back to the original recipe.
      await prisma.planEntry.update({
        where: { id: e.id },
        data: { modifiedRecipe: Prisma.DbNull, convertedSteps: [], convertedForEquipment: [] },
      });
      continue;
    }
    const { shortlist } = await shortlistFor(userId, ctx, e.mealType as MealType, [...used]);
    if (shortlist.length === 0) {
      await prisma.planEntry.delete({ where: { id: e.id } });
      continue;
    }
    used.add(shortlist[0].id);
    await prisma.planEntry.update({
      where: { id: e.id },
      data: { recipeId: shortlist[0].id, modifiedRecipe: Prisma.DbNull, convertedSteps: [], convertedForEquipment: [] },
    });
  }
  return broken.length;
}

/**
 * Asks the AI to choose from the shortlist. If the user is over their AI budget the
 * top-ranked recipe is used instead, so swapping never fails because of Gemini limits.
 */
async function pickFrom(
  userId: string,
  shortlist: RecipeLite[],
  ctx: { targetCalories: number; likedTags: string[]; wish?: string },
): Promise<Choice> {
  if (!takeAiBudget(userId)) {
    return {
      recipeId: shortlist[0].id,
      reason: ctx.wish ? "Closest match to what you asked for." : "Best match for your calorie target and tastes.",
      fromAi: false,
    };
  }
  return chooseRecipe(shortlist, ctx);
}

/**
 * Recommend a recipe for one day. By default the day has one pick, and asking again returns it.
 * `extra` adds another recipe the same day. The AI chooses from a code-built shortlist; if it
 * is unavailable the top-ranked recipe is used.
 */
export async function recommendForDay(
  userId: string,
  input: { date: string; mealType: MealType; extra: boolean },
) {
  const weekStart = mondayOf(input.date);
  const ctx = await getPlanningContext(userId);

  const wp = await prisma.weeklyPlan.upsert({
    where: { userId_weekStart: { userId, weekStart: toDate(weekStart) } },
    create: { userId, weekStart: toDate(weekStart), calorieTarget: ctx.calorieTarget },
    update: {},
    include: { entries: { select: { recipeId: true, date: true, mealType: true, position: true } } },
  });

  if (wp.entries.length > 0 && (await repairUnsafeEntries(userId, wp.id, ctx)) > 0) {
    wp.entries = await prisma.planEntry.findMany({
      where: { planId: wp.id },
      select: { recipeId: true, date: true, mealType: true, position: true },
    });
  }

  const sameSlot = wp.entries.filter((e) => isoOf(e.date) === input.date && e.mealType === input.mealType);
  if (sameSlot.length > 0 && !input.extra) {
    const first = await prisma.planEntry.findFirstOrThrow({
      where: { planId: wp.id, date: toDate(input.date), mealType: input.mealType, position: 0 },
      include: entryInclude,
    });
    return { entry: formatEntry(first), reason: null, fromAi: false };
  }

  const exclude = [...new Set([...wp.entries.map((e) => e.recipeId), ...(await recentRecipeIds(userId, weekStart))])];
  const { shortlist, targetCalories, taste } = await shortlistFor(userId, ctx, input.mealType, exclude);
  if (shortlist.length === 0) throw new HttpError(422, "No recipes match your diet and allergies");

  const choice = await pickFrom(userId, shortlist, { targetCalories, likedTags: topTags(taste).liked });
  const position = sameSlot.length === 0 ? 0 : Math.max(...sameSlot.map((e) => e.position)) + 1;
  const entry = await prisma.planEntry.create({
    data: {
      userId, planId: wp.id, recipeId: choice.recipeId,
      date: toDate(input.date), mealType: input.mealType, position,
    },
    include: entryInclude,
  });
  return { entry: formatEntry(entry), reason: choice.reason, fromAi: choice.fromAi };
}

// ---------- swap ----------

/**
 * Replace the recipe on one of the user's plan entries with another from the same filtered
 * pool. Clears any cached conversion or modification, and records swap signals so future
 * ranking learns from it.
 *
 * With `request` ("something with chicken", "lighter, no onions") the shortlist is built from
 * recipes that match those words, still inside the user's diet and allergy filters, and the AI
 * picks the best of them. If nothing matches, a normal swap is done and `matchedRequest` is false.
 */
export async function swapEntry(userId: string, entryId: string, request?: string) {
  const entry = await prisma.planEntry.findFirst({ where: { id: entryId, userId } });
  if (!entry) throw new HttpError(404, "Plan entry not found");

  const ctx = await getPlanningContext(userId);
  const weekEntries = await prisma.planEntry.findMany({ where: { planId: entry.planId }, select: { recipeId: true } });
  const exclude = [...new Set([...weekEntries.map((e) => e.recipeId), ...(await recentRecipeIds(userId, isoOf(entry.date)))])];
  const mealType = entry.mealType as MealType;

  const parsed = request ? parseWish(request) : null;
  const wish = parsed && (parsed.want.length > 0 || parsed.avoid.length > 0) ? parsed : null;

  let found = await shortlistFor(userId, ctx, mealType, exclude, wish);
  const matchedRequest = wish ? found.shortlist.length > 0 : null;
  if (wish && !matchedRequest) {
    // Nothing matched what they wanted. Still honour what they asked to avoid.
    const avoidOnly = wish.avoid.length > 0 ? { ...wish, want: [] } : null;
    found = await shortlistFor(userId, ctx, mealType, exclude, avoidOnly);
    if (found.shortlist.length === 0) found = await shortlistFor(userId, ctx, mealType, exclude);
  }
  const { shortlist, targetCalories, taste } = found;
  if (shortlist.length === 0) throw new HttpError(422, "No other recipes match your diet and allergies");

  const choice = await pickFrom(userId, shortlist, {
    targetCalories,
    likedTags: topTags(taste).liked,
    wish: matchedRequest ? wish!.text : undefined,
  });
  const updated = await prisma.planEntry.update({
    where: { id: entry.id },
    data: {
      recipeId: choice.recipeId,
      convertedSteps: [],
      convertedForEquipment: [],
      modifiedRecipe: Prisma.DbNull,
    },
    include: entryInclude,
  });
  await recordSignal(userId, entry.recipeId, "swap_out");
  await recordSignal(userId, choice.recipeId, "swap_in");
  const reason =
    matchedRequest === false
      ? `Nothing matched "${wish!.text}" within your diet and allergies, so here is a close alternative${wish!.avoid.length > 0 ? ` without ${wish!.avoid.join(" or ")}` : ""}.`
      : choice.reason;
  return { entry: formatEntry(updated), reason, fromAi: choice.fromAi, matchedRequest };
}

// ---------- recipe detail ----------

const parseLines = z.array(
  z.object({ name: z.string(), quantity: z.number().catch(1), unit: z.string().catch("item") }),
);

function cleanIngredients(json: unknown) {
  const r = parseLines.safeParse(json);
  return r.success ? r.data : [];
}

/** A recipe the user may see (shared, or their own AI recipe), or a 404. */
export async function getRecipeForUser(userId: string, recipeId: string) {
  const r = await prisma.recipe.findFirst({
    where: { id: recipeId, OR: [{ ownerId: null }, { ownerId: userId }] },
  });
  if (!r) throw new HttpError(404, "Recipe not found");
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    calories: r.calories,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    ingredients: cleanIngredients(r.ingredients),
    steps: r.steps,
    tags: r.tags,
    equipment: r.equipment,
    allergens: r.allergens,
    diets: r.diets,
  };
}

/** What the recipe page shows for one of the user's plan entries: the recipe plus their own changes. */
export async function getEntryDetail(userId: string, entryId: string) {
  const entry = await prisma.planEntry.findFirst({ where: { id: entryId, userId }, include: entryInclude });
  if (!entry) throw new HttpError(404, "Plan entry not found");
  return {
    entry: formatEntry(entry),
    recipe: await getRecipeForUser(userId, entry.recipeId),
    convertedSteps: entry.convertedSteps,
    convertedForEquipment: entry.convertedForEquipment,
    modifiedRecipe: entry.modifiedRecipe,
  };
}
