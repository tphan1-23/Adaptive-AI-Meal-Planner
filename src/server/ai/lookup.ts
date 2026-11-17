import { prisma } from "../db/prisma";
import { buildNutritionLookup, type NutritionLookup } from "./nutrition";

const TTL_MS = 10 * 60_000;
let cached: { at: number; lookup: NutritionLookup } | null = null;

/** The ingredient lookup, built from the Ingredient table and reused for 10 minutes. */
export async function getNutritionLookup(): Promise<NutritionLookup> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.lookup;
  const rows = await prisma.ingredient.findMany({
    select: { name: true, calories: true, proteinG: true, carbsG: true, fatG: true },
  });
  cached = { at: Date.now(), lookup: buildNutritionLookup(rows) };
  return cached.lookup;
}
