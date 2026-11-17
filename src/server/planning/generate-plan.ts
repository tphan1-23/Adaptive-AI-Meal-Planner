import type { MealType, PlannedDay, PlanningProfile, RecipeLite, TagAffinity } from "@/types";
import { filterRecipes } from "./filter";
import { fitsMeal } from "./meal-types";
import { rankRecipes } from "./rank";
import { addDays } from "./week";

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
  /** Recipes to avoid, e.g. ones the user had in recent weeks. */
  excludeIds?: ReadonlySet<string>;
  /**
   * Adds variety: picks days from the best-ranked candidates in a repeatable shuffle.
   * Use something like `${userId}:${weekStart}` so a week is stable but differs from the next.
   * Without a seed the plan is simply the top-ranked recipes in order.
   */
  seed?: string;
  /** How many top candidates the seeded shuffle draws from. Default max(25, days * 3). */
  candidates?: number;
}

/** Small seeded PRNG (mulberry32) so a seed always gives the same shuffle. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One recipe per day, sized to the meal's share of the daily target.
 * Only recipes suited to the meal type are used (falling back to every allowed recipe if
 * none are tagged for it). Recipes are not repeated unless the pool runs out.
 */
export function generatePlan(input: GeneratePlanInput): PlannedDay[] {
  const mealType = input.mealType ?? "dinner";
  const targetCalories = input.profile.calorieTarget * MEAL_SHARE[mealType];

  const allowed = filterRecipes(input.recipes, input.profile, input.excludeIds);
  const suited = allowed.filter((r) => fitsMeal(r, mealType));
  const pool = suited.length > 0 ? suited : allowed;
  if (pool.length === 0) return [];

  let ranked = rankRecipes(pool, { targetCalories, affinity: input.affinity });
  if (input.seed !== undefined) {
    const top = ranked.slice(0, Math.max(input.candidates ?? 25, input.days * 3));
    ranked = shuffle(top, seededRandom(input.seed));
  }

  const plan: PlannedDay[] = [];
  for (let i = 0; i < input.days; i++) {
    const recipe = ranked[i % ranked.length];
    plan.push({ date: addDays(input.startDate, i), mealType, recipeId: recipe.id });
  }
  return plan;
}
