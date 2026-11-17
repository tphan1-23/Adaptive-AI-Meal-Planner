import type { MealType, RecipeLite } from "@/types";

/** Dataset tags that make a recipe suitable for each kind of meal. */
export const MEAL_TAGS: Record<MealType, string[]> = {
  breakfast: ["breakfast", "brunch"],
  lunch: ["main-dish", "lunch", "one-dish-meal", "soups-stews", "salads"],
  dinner: ["main-dish", "one-dish-meal", "soups-stews"],
  snack: ["snacks", "appetizers"],
};

/** True if the recipe is tagged as suitable for this meal (keeps chutneys out of dinner). */
export function fitsMeal(recipe: Pick<RecipeLite, "tags">, mealType: MealType): boolean {
  return recipe.tags.some((t) => MEAL_TAGS[mealType].includes(t));
}
