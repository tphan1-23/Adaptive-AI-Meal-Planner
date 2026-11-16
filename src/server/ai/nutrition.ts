export interface Per100g {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Looks up an ingredient's nutrition per 100 g (from the Ingredient table). */
export type NutritionLookup = (name: string) => Per100g | undefined;

export interface Nutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Nutrition for a recipe, computed from ingredient weights. Returns null if any
 * ingredient cannot be matched, because we never let the AI estimate nutrition.
 */
export function computeNutrition(
  ingredients: { name: string; grams: number }[],
  lookup: NutritionLookup,
): Nutrition | null {
  const total: Nutrition = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const { name, grams } of ingredients) {
    const n = lookup(name);
    if (!n || !(grams > 0)) return null;
    const f = grams / 100;
    total.calories += n.calories * f;
    total.proteinG += n.proteinG * f;
    total.carbsG += n.carbsG * f;
    total.fatG += n.fatG * f;
  }
  const r = (x: number) => Math.round(x * 10) / 10;
  return { calories: r(total.calories), proteinG: r(total.proteinG), carbsG: r(total.carbsG), fatG: r(total.fatG) };
}
