import { z } from "zod";
import type { MealType, RecipeLite } from "@/types";
import { prisma } from "../db/prisma";
import { photoFor } from "../recipes/dish-photos";
import { normalizeAllergies } from "./allergens";
import { filterRecipes } from "./filter";
import { MEAL_SHARE } from "./generate-plan";
import { MEAL_TAGS } from "./meal-types";
import { rankRecipes } from "./rank";
import { dropUnsafeByIngredients, getPlanningContext, getTasteScores, RECIPE_SELECT } from "./service";

const MAX_PAGE = 30;
/** Most recipes ranked in code at once; the SQL filters keep the set below this in practice. */
const RANK_POOL = 2000;

export const browseInput = z.object({
  q: z.string().trim().max(60).optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  minCalories: z.coerce.number().int().min(0).max(5000).optional(),
  maxCalories: z.coerce.number().int().min(0).max(5000).optional(),
  sort: z.enum(["for-you", "name", "calories"]).default("for-you"),
  saved: z.enum(["true", "false"]).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(20),
});
export type BrowseInput = z.infer<typeof browseInput>;

/**
 * Every recipe the user may use, one page at a time. The list only contains recipes that pass the user's allergy and
 * diet rules (in SQL, in code, and on the real ingredient names of the page being shown), so nothing unsafe is offered.
 * "for-you" orders by calorie fit for the meal and the learned taste scores; no AI is involved.
 */
export async function browseRecipes(userId: string, input: BrowseInput) {
  const ctx = await getPlanningContext(userId);
  const allergies = normalizeAllergies(ctx.allergies);
  const diet = ctx.diet?.trim().toLowerCase();
  const mealType: MealType = input.mealType ?? "dinner";

  const words = (input.q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 4);
  const savedIds =
    input.saved === "true"
      ? (await prisma.favoriteRecipe.findMany({ where: { userId }, select: { recipeId: true } })).map((f) => f.recipeId)
      : null;

  // For-you without a calorie filter stays near the meal's target so the best matches are in the loaded set.
  const target = ctx.calorieTarget * MEAL_SHARE[mealType];
  const wide = input.sort === "for-you" && input.minCalories === undefined && input.maxCalories === undefined && !words.length && !savedIds;
  const calories = {
    ...(input.minCalories !== undefined ? { gte: input.minCalories } : wide ? { gte: target * 0.2 } : {}),
    ...(input.maxCalories !== undefined ? { lte: input.maxCalories } : wide ? { lte: target * 1.8 } : {}),
  };

  const where = {
    AND: [
      { OR: [{ ownerId: null }, { ownerId: userId }] },
      ...words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { tags: { has: w } }] })),
    ],
    ...(input.mealType ? { tags: { hasSome: MEAL_TAGS[input.mealType] } } : {}),
    ...(Object.keys(calories).length ? { calories } : {}),
    ...(allergies.length ? { NOT: { allergens: { hasSome: allergies } } } : {}),
    ...(diet ? { diets: { has: diet } } : {}),
    ...(savedIds ? { id: { in: savedIds } } : {}),
  };

  const total = await prisma.recipe.count({ where });
  let page: RecipeLite[];
  let hasMore: boolean;

  if (input.sort === "for-you") {
    const rows = (await prisma.recipe.findMany({ where, select: RECIPE_SELECT, take: RANK_POOL })) as RecipeLite[];
    const taste = await getTasteScores(userId, ctx.cuisines);
    const ranked = rankRecipes(filterRecipes(rows, ctx), { targetCalories: target, affinity: taste });
    page = ranked.slice(input.offset, input.offset + input.limit);
    hasMore = input.offset + input.limit < ranked.length;
  } else {
    const rows = (await prisma.recipe.findMany({
      where,
      select: RECIPE_SELECT,
      orderBy: input.sort === "name" ? [{ name: "asc" }, { id: "asc" }] : [{ calories: "asc" }, { id: "asc" }],
      skip: input.offset,
      take: input.limit + 1,
    })) as RecipeLite[];
    hasMore = rows.length > input.limit;
    page = filterRecipes(rows.slice(0, input.limit), ctx);
  }

  const safe = await dropUnsafeByIngredients(page, ctx, null);
  const meta = safe.length
    ? await prisma.recipe.findMany({ where: { id: { in: safe.map((r) => r.id) } }, select: { id: true, source: true } })
    : [];
  const sourceOf = new Map(meta.map((m) => [m.id, m.source]));
  const favs = safe.length
    ? new Set((await prisma.favoriteRecipe.findMany({ where: { userId, recipeId: { in: safe.map((r) => r.id) } }, select: { recipeId: true } })).map((f) => f.recipeId))
    : new Set<string>();

  return {
    recipes: safe.map((r) => ({
      id: r.id,
      name: r.name,
      calories: r.calories,
      proteinG: r.proteinG ?? null,
      tags: r.tags,
      source: sourceOf.get(r.id) ?? "dataset",
      imageUrl: photoFor(r.name)?.url ?? null,
      isFavorite: favs.has(r.id),
    })),
    total,
    hasMore,
    nextOffset: input.offset + input.limit,
  };
}
