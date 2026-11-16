import type { MealType, PlannedDay, PlanningProfile, RecipeLite, TagAffinity } from "@/types";
import { filterRecipes } from "./filter";
import { rankRecipes } from "./rank";

/** Share of the daily calorie target one meal should cover. */
export const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.4,
  snack: 0.1,
};

export interface GeneratePlanInput {
  recipes: RecipeLite[];
  profile: PlanningProfile;
  /** First day, YYYY-MM-DD. */
  startDate: string;
  days: number;
  mealType?: MealType;
  affinity?: TagAffinity;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * One recipe per day, sized to the meal's share of the daily target.
 * Recipes are not repeated within the plan unless the filtered pool runs out.
 */
export function generatePlan(input: GeneratePlanInput): PlannedDay[] {
  const mealType = input.mealType ?? "dinner";
  const targetCalories = input.profile.calorieTarget * MEAL_SHARE[mealType];
  const pool = filterRecipes(input.recipes, input.profile);
  if (pool.length === 0) return [];

  const ranked = rankRecipes(pool, { targetCalories, affinity: input.affinity });
  const plan: PlannedDay[] = [];
  for (let i = 0; i < input.days; i++) {
    // Best-ranked first; wrap around only once every recipe has been used.
    const recipe = ranked[i % ranked.length];
    plan.push({ date: addDays(input.startDate, i), mealType, recipeId: recipe.id });
  }
  return plan;
}
