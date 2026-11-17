import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { MealType, PlanningProfile, RecipeLite, TagAffinity } from "@/types";
import { chooseRecipe } from "../ai/adapter";
import { getAffinity, recordSignal } from "../adherence/service";
import { topTags } from "../adherence/affinity";
import { HttpError } from "../auth/require-user";
import { prisma } from "../db/prisma";
import { normalizeAllergies } from "./allergens";
import { filterRecipes } from "./filter";
import { generatePlan, MEAL_SHARE } from "./generate-plan";
import { MEAL_TAGS } from "./meal-types";
import { rankRecipes } from "./rank";
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
): Promise<RecipeLite[]> {
  const target = profile.calorieTarget * MEAL_SHARE[mealType];
  const allergies = normalizeAllergies(profile.allergies);
  const diet = profile.diet?.trim().toLowerCase();

  let rows: RecipeLite[] = [];
  for (const w of CALORIE_WINDOWS) {
    rows = await prisma.recipe.findMany({
      where: {
        OR: [{ ownerId: null }, { ownerId: userId }],
        calories: { gte: target * (1 - w), lte: target * (1 + w) },
        tags: { hasSome: MEAL_TAGS[mealType] },
        ...(allergies.length ? { NOT: { allergens: { hasSome: allergies } } } : {}),
        ...(diet ? { diets: { has: diet } } : {}),
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      },
      select: RECIPE_SELECT,
      take: 2000,
    });
    if (rows.length >= MIN_POOL) break;
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
  const plan = await prisma.weeklyPlan.findUnique({
    where: { userId_weekStart: { userId, weekStart: toDate(weekStart) } },
    include: planInclude,
  });
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
  if (existing && existing.entries.length > 0 && !regenerate) return formatPlan(existing);

  const ctx = await getPlanningContext(userId);
  const [recent, taste] = await Promise.all([
    recentRecipeIds(userId, weekStart),
    getTasteScores(userId, ctx.cuisines),
  ]);
  const recipes = await loadCandidates(userId, ctx, "dinner", recent);

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

async function shortlistFor(userId: string, ctx: UserPlanningContext, mealType: MealType, excludeIds: string[]) {
  const [pool, taste] = await Promise.all([
    loadCandidates(userId, ctx, mealType, excludeIds),
    getTasteScores(userId, ctx.cuisines),
  ]);
  const targetCalories = ctx.calorieTarget * MEAL_SHARE[mealType];
  const shortlist = rankRecipes(pool, { targetCalories, affinity: taste }).slice(0, SHORTLIST_SIZE);
  return { shortlist, targetCalories, taste };
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

  const choice = await chooseRecipe(shortlist, { targetCalories, likedTags: topTags(taste).liked });
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
 */
export async function swapEntry(userId: string, entryId: string) {
  const entry = await prisma.planEntry.findFirst({ where: { id: entryId, userId } });
  if (!entry) throw new HttpError(404, "Plan entry not found");

  const ctx = await getPlanningContext(userId);
  const weekEntries = await prisma.planEntry.findMany({ where: { planId: entry.planId }, select: { recipeId: true } });
  const exclude = [...new Set([...weekEntries.map((e) => e.recipeId), ...(await recentRecipeIds(userId, isoOf(entry.date)))])];
  const mealType = entry.mealType as MealType;

  const { shortlist, targetCalories, taste } = await shortlistFor(userId, ctx, mealType, exclude);
  if (shortlist.length === 0) throw new HttpError(422, "No other recipes match your diet and allergies");

  const choice = await chooseRecipe(shortlist, { targetCalories, likedTags: topTags(taste).liked });
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
  return { entry: formatEntry(updated), reason: choice.reason, fromAi: choice.fromAi };
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
