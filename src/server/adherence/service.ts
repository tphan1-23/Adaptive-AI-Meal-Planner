import { prisma } from "../db/prisma";
import { applySignal, type SignalType } from "./affinity";

/** The user's learned tag scores as a plain map, the shape rank.ts expects. */
export async function getAffinity(userId: string): Promise<Record<string, number>> {
  const rows = await prisma.userTagAffinity.findMany({ where: { userId } });
  return Object.fromEntries(rows.map((r) => [r.tag, r.score]));
}

/**
 * Save a signal and update the user's affinity for the recipe's meaningful tags.
 * Returns the tags whose scores changed, or null if the recipe does not exist / is not visible
 * to this user (a private AI recipe owned by someone else).
 */
export async function recordSignal(userId: string, recipeId: string, type: SignalType, value = 1) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: { tags: true },
  });
  if (!recipe) return null;

  const existing = await getAffinity(userId);
  const updates = applySignal(existing, recipe.tags, type, value);

  await prisma.$transaction([
    prisma.userRecipeSignal.create({ data: { userId, recipeId, type, value } }),
    ...Object.entries(updates).map(([tag, score]) =>
      prisma.userTagAffinity.upsert({
        where: { userId_tag: { userId, tag } },
        create: { userId, tag, score },
        update: { score },
      }),
    ),
  ]);
  return updates;
}
