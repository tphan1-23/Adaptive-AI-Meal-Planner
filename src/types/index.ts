export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface RecipeIngredient {
  name: string;
  quantity: number;
  unit: string;
}

/** Plain recipe shape used by the planning engine (matches the Prisma Recipe model). */
export interface RecipeLite {
  id: string;
  name: string;
  calories: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  ingredients?: RecipeIngredient[];
  steps?: string[];
  tags: string[];
  equipment: string[];
  allergens: string[];
  diets: string[];
}

/** The slice of a user's profile the planning engine needs. */
export interface PlanningProfile {
  diet?: string | null;
  allergies: string[];
  calorieTarget: number;
}

/** Per-tag affinity score (higher = user likes it more). Computed by server/adherence. */
export type TagAffinity = Record<string, number>;

export interface PlannedDay {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  recipeId: string;
}
