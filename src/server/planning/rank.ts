import type { RecipeLite, TagAffinity } from "@/types";

export interface RankOptions {
  /** Calories this meal should land near. */
  targetCalories: number;
  affinity?: TagAffinity;
  /** How much one affinity point offsets calorie error (fraction of target). Default 0.05. */
  affinityWeight?: number;
}

/** Lower is better: relative calorie error, minus the user's tag affinity bonus. */
export function scoreRecipe(recipe: RecipeLite, opts: RankOptions): number {
  const calorieError = Math.abs(recipe.calories - opts.targetCalories) / opts.targetCalories;
  const weight = opts.affinityWeight ?? 0.05;
  const affinity = recipe.tags.reduce((sum, t) => sum + (opts.affinity?.[t] ?? 0), 0);
  return calorieError - weight * affinity;
}

/**
 * Deterministic pre-ranking by calorie fit and learned affinity, best first.
 * Ties break on id so output is stable. The AI only ever sees this shortlist.
 */
export function rankRecipes(recipes: RecipeLite[], opts: RankOptions): RecipeLite[] {
  return recipes
    .map((r) => ({ r, s: scoreRecipe(r, opts) }))
    .sort((a, b) => a.s - b.s || a.r.id.localeCompare(b.r.id))
    .map(({ r }) => r);
}
