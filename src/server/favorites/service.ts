import { recordSignal } from "../adherence/service";
import { HttpError } from "../auth/require-user";
import { prisma } from "../db/prisma";
import { photoFor } from "../recipes/dish-photos";

const recipeSelect = {
  id: true, name: true, calories: true, proteinG: true, carbsG: true, fatG: true, tags: true, ownerId: true,
} as const;

/** The user's saved recipes, newest first. Only recipes they may see (shared, or their own AI recipes). */
export async function listFavorites(userId: string) {
  const rows = await prisma.favoriteRecipe.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { recipe: { select: recipeSelect } },
  });
  return rows
    .filter((r) => r.recipe.ownerId === null || r.recipe.ownerId === userId)
    .map(({ recipe, createdAt }) => ({
      id: recipe.id,
      name: recipe.name,
      calories: recipe.calories,
      proteinG: recipe.proteinG,
      carbsG: recipe.carbsG,
      fatG: recipe.fatG,
      tags: recipe.tags,
      imageUrl: photoFor(recipe.name)?.url ?? null,
      savedAt: createdAt.toISOString(),
    }));
}

/** Save a recipe. Saving twice does nothing new. The first save also teaches the taste model (a `favorite` signal). */
export async function addFavorite(userId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: { id: true },
  });
  if (!recipe) throw new HttpError(404, "Recipe not found");
  const existing = await prisma.favoriteRecipe.findUnique({ where: { userId_recipeId: { userId, recipeId } } });
  if (existing) return { saved: true, created: false };
  await prisma.favoriteRecipe.create({ data: { userId, recipeId } });
  await recordSignal(userId, recipeId, "favorite");
  return { saved: true, created: true };
}

/** Remove a saved recipe. Removing one that is not saved is fine. */
export async function removeFavorite(userId: string, recipeId: string) {
  await prisma.favoriteRecipe.deleteMany({ where: { userId, recipeId } });
  return { saved: false };
}

export async function isFavorite(userId: string, recipeId: string): Promise<boolean> {
  return (await prisma.favoriteRecipe.count({ where: { userId, recipeId } })) > 0;
}
