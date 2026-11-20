import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { MealType, RecipeIngredient, RecipeLite } from "@/types";
import { topTags } from "../adherence/affinity";
import { HttpError } from "../auth/require-user";
import { prisma } from "../db/prisma";
import { detectAllergens } from "../planning/allergens";
import { MEAL_SHARE } from "../planning/generate-plan";
import { MEAL_TAGS } from "../planning/meal-types";
import { formatEntry, getPlanningContext, getTasteScores, loadCandidates } from "../planning/service";
import { rankRecipes } from "../planning/rank";
import { describeSubstitute, findSubstitutes } from "../planning/substitution";
import { mondayOf, toDate } from "../planning/week";
import { convertSteps, generateRecipe, modifyRecipe, phraseSubstitution } from "./adapter";
import { getIngredientIndex, getNutritionLookup } from "./lookup";
import { takeAiBudget } from "./rate-limit";

/** Cap on AI-generated recipes stored per user per day. */
const GENERATED_PER_DAY = 10;

function limitAi(userId: string) {
  if (!takeAiBudget(userId)) {
    throw new HttpError(429, "Too many AI requests. Please wait a minute.");
  }
}

const ingredientLine = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().catch(1),
  unit: z.string().catch("item"),
});

function parseIngredients(json: unknown): RecipeIngredient[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    const r = ingredientLine.safeParse(raw);
    return r.success ? [r.data] : [];
  });
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

/** The user's own plan entry with its recipe, or a 404. Other users' entries are never visible. */
async function loadEntry(userId: string, entryId: string) {
  const entry = await prisma.planEntry.findFirst({
    where: { id: entryId, userId },
    include: { recipe: true },
  });
  if (!entry) throw new HttpError(404, "Plan entry not found");
  return entry;
}

function toLite(r: Awaited<ReturnType<typeof loadEntry>>["recipe"]): RecipeLite {
  return {
    id: r.id, name: r.name, calories: r.calories, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG,
    ingredients: parseIngredients(r.ingredients), steps: r.steps,
    tags: r.tags, equipment: r.equipment, allergens: r.allergens, diets: r.diets,
  };
}

// ---------- equipment conversion ----------

/** Convert a plan entry's steps for the user's equipment. The result is cached on the entry. */
export async function convertEntry(userId: string, entryId: string) {
  const entry = await loadEntry(userId, entryId);
  const ctx = await getPlanningContext(userId);
  if (ctx.equipment.length === 0) throw new HttpError(400, "Add your kitchen equipment to your profile first");

  if (entry.convertedSteps.length > 0 && sameSet(entry.convertedForEquipment, ctx.equipment)) {
    return { available: true, steps: entry.convertedSteps, note: "", cached: true };
  }

  limitAi(userId);
  const modified = entry.modifiedRecipe as { steps?: string[]; ingredients?: unknown } | null;
  const lite = toLite(entry.recipe);
  if (modified?.steps?.length) {
    lite.steps = modified.steps;
    lite.ingredients = parseIngredients(modified.ingredients);
  }

  const out = await convertSteps(lite, ctx.equipment);
  if (out.available) {
    await prisma.planEntry.update({
      where: { id: entry.id },
      data: { convertedSteps: out.steps, convertedForEquipment: ctx.equipment },
    });
  }
  return { ...out, cached: false };
}

// ---------- recipe modification ----------

/** Apply a free-text change ("make it vegetarian") to a plan entry's recipe, for this user only. */
export async function modifyEntry(userId: string, entryId: string, request: string) {
  const entry = await loadEntry(userId, entryId);
  const ctx = await getPlanningContext(userId);

  limitAi(userId);
  const lookup = await getNutritionLookup();
  const result = await modifyRecipe(toLite(entry.recipe), request, ctx, lookup);
  if (!result) throw new HttpError(422, "That change could not be made safely. Try different wording.");

  const updated = await prisma.planEntry.update({
    where: { id: entry.id },
    // A modified recipe has new steps, so any earlier equipment conversion no longer applies.
    data: { modifiedRecipe: result as unknown as Prisma.InputJsonValue, convertedSteps: [], convertedForEquipment: [] },
    include: { recipe: { select: { id: true, name: true, calories: true, proteinG: true, carbsG: true, fatG: true, tags: true, equipment: true } } },
  });
  return { entry: formatEntry(updated), modified: result };
}

/** Throw away a modification and go back to the original recipe. */
export async function resetModification(userId: string, entryId: string) {
  const entry = await loadEntry(userId, entryId);
  await prisma.planEntry.update({
    where: { id: entry.id },
    data: { modifiedRecipe: Prisma.DbNull, convertedSteps: [], convertedForEquipment: [] },
  });
}

// ---------- fully AI-generated recipe ----------

/**
 * Create a brand-new recipe from the user's tastes. Nutrition is computed in code from the
 * Ingredient table, allergens are detected from the ingredient names, and the recipe is private
 * to the user. With `date`, it is also added to that day as an extra.
 */
export async function generateForUser(
  userId: string,
  input: { wish?: string; date?: string; mealType: MealType },
) {
  const ctx = await getPlanningContext(userId);

  const since = new Date(Date.now() - 86_400_000);
  const today = await prisma.recipe.count({ where: { ownerId: userId, source: "ai", createdAt: { gte: since } } });
  if (today >= GENERATED_PER_DAY) throw new HttpError(429, "Daily limit for AI recipes reached");
  limitAi(userId);

  const [lookup, taste] = await Promise.all([getNutritionLookup(), getTasteScores(userId, ctx.cuisines)]);
  const targetCalories = ctx.calorieTarget * MEAL_SHARE[input.mealType];
  const pool = await loadCandidates(userId, ctx, input.mealType);
  const inspiration = rankRecipes(pool, { targetCalories, affinity: taste }).slice(0, 3);
  const likedTags = topTags(taste).liked;

  const generated = await generateRecipe(
    { inspiration, likedTags, profile: ctx, targetCalories, wish: input.wish },
    lookup,
  );
  if (!generated) throw new HttpError(422, "Could not create a safe recipe this time. Please try again.");

  const recipe = await prisma.recipe.create({
    data: {
      source: "ai",
      ownerId: userId,
      basedOnIds: inspiration.map((r) => r.id),
      name: generated.name,
      calories: generated.calories,
      proteinG: generated.proteinG,
      carbsG: generated.carbsG,
      fatG: generated.fatG,
      ingredients: generated.ingredients as unknown as Prisma.InputJsonValue,
      steps: generated.steps,
      tags: [...new Set([...generated.tags, ...MEAL_TAGS[input.mealType].slice(0, 1), "ai-generated"])],
      equipment: generated.equipment,
      allergens: detectAllergens(generated.ingredients.map((i) => i.name)),
      diets: [],
    },
  });

  let entry = null;
  if (input.date) {
    const date = toDate(input.date);
    const weekStart = toDate(mondayOf(input.date));
    const plan = await prisma.weeklyPlan.upsert({
      where: { userId_weekStart: { userId, weekStart } },
      create: { userId, weekStart, calorieTarget: ctx.calorieTarget },
      update: {},
    });
    const taken = await prisma.planEntry.findMany({
      where: { planId: plan.id, date, mealType: input.mealType },
      select: { position: true },
    });
    const created = await prisma.planEntry.create({
      data: {
        userId, planId: plan.id, recipeId: recipe.id, date, mealType: input.mealType,
        position: taken.length ? Math.max(...taken.map((t) => t.position)) + 1 : 0,
      },
      include: { recipe: { select: { id: true, name: true, calories: true, proteinG: true, carbsG: true, fatG: true, tags: true, equipment: true } } },
    });
    entry = formatEntry(created);
  }
  return { recipe, entry };
}

// ---------- ingredient substitution ----------

/** The AI sentence is a nicety: if it takes longer than this the template sentence is used. */
const PHRASING_TIMEOUT_MS = 6_000;

/** Only ingredients used in at least this many recipe lines are suggested, so nobody is told to cook with antelope. */
const MIN_POPULARITY = 15;

/**
 * Suggest swaps for one ingredient of a plan entry's recipe. The match is nearest-neighbor
 * search on nutrition in the same category, excluding the user's allergens and respecting their
 * diet. The AI only words the best suggestion; the others use a template, and if the AI is
 * unavailable or the user is over their AI limit every suggestion uses the template.
 */
export async function suggestSubstitutes(userId: string, entryId: string, ingredient: string) {
  const entry = await loadEntry(userId, entryId);
  const ctx = await getPlanningContext(userId);

  const modified = entry.modifiedRecipe as { ingredients?: unknown } | null;
  const lines = parseIngredients(modified?.ingredients).length > 0
    ? parseIngredients(modified?.ingredients)
    : parseIngredients(entry.recipe.ingredients);
  const wanted = ingredient.trim().toLowerCase();
  const line = lines.find((l) => l.name.toLowerCase() === wanted);
  if (!line) throw new HttpError(404, "That ingredient is not in this recipe");

  const index = await getIngredientIndex();
  const target = index.find(line.name);
  if (!target) throw new HttpError(422, "No nutrition data for that ingredient");

  // Recipe amounts are only usable as grams; otherwise assume 100 g and say so.
  const amountAssumed = !(line.unit.toLowerCase() === "g" && line.quantity > 0);
  const originalGrams = amountAssumed ? 100 : line.quantity;

  const common = index.rows.filter((r) => (index.popularity.get(r.id) ?? 0) >= MIN_POPULARITY);
  const found = findSubstitutes(target, common, { allergies: ctx.allergies, diet: ctx.diet, limit: 3 }, originalGrams);

  const substitutes = found.map((s) => ({ ...s, note: describeSubstitute(target, s, originalGrams) }));
  if (substitutes[0]?.quality === "close" && takeAiBudget(userId)) {
    const phrased = await Promise.race([
      phraseSubstitution({
        recipeName: entry.recipe.name,
        original: target.name,
        substitute: substitutes[0].name,
        grams: substitutes[0].grams,
        originalGrams,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), PHRASING_TIMEOUT_MS)),
    ]);
    if (phrased) substitutes[0].note = phrased;
  }
  return { ingredient: line.name, matchedAs: target.name, amountAssumed, originalGrams, substitutes };
}
