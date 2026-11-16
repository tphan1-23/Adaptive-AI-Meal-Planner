import type { PlanningProfile, RecipeLite } from "@/types";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Hard filters, done in code and never delegated to the AI:
 * - drop any recipe containing one of the user's allergens
 * - if the user follows a diet, keep only recipes tagged with it
 * - drop explicitly excluded recipe ids (e.g. already planned this week)
 * Equipment is intentionally NOT a filter.
 */
export function filterRecipes(
  recipes: RecipeLite[],
  profile: Pick<PlanningProfile, "diet" | "allergies">,
  excludeIds: ReadonlySet<string> = new Set(),
): RecipeLite[] {
  const allergies = new Set(profile.allergies.map(norm));
  const diet = profile.diet ? norm(profile.diet) : null;

  return recipes.filter((r) => {
    if (excludeIds.has(r.id)) return false;
    if (r.allergens.some((a) => allergies.has(norm(a)))) return false;
    if (diet && !r.diets.some((d) => norm(d) === diet)) return false;
    return true;
  });
}

/** True if any ingredient name mentions one of the user's allergens. Used to re-check AI output. */
export function ingredientsHaveAllergen(ingredientNames: string[], allergies: string[]): boolean {
  const al = allergies.map(norm).filter(Boolean);
  return ingredientNames.some((n) => {
    const name = norm(n);
    return al.some((a) => name.includes(a));
  });
}
