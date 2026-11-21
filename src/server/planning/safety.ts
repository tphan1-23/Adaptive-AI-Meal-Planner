import { ingredientsHaveAllergen } from "./filter";
import { normalizeAllergies } from "./allergens";
import { violatesDiet } from "./substitution";

/** The user's rules that every meal must respect. */
export interface SafetyProfile {
  allergies: string[];
  diet?: string | null;
}

/** True when any ingredient name contains one of the user's allergens or breaks their diet. */
export function namesBreakRules(ingredientNames: string[], profile: SafetyProfile): boolean {
  return (
    ingredientsHaveAllergen(ingredientNames, profile.allergies) ||
    ingredientNames.some((n) => violatesDiet({ name: n, category: null }, profile.diet))
  );
}

/** Ingredient names from a recipe's `ingredients` JSON, tolerating anything unexpected. */
export function ingredientNamesOf(json: unknown): string[] {
  return Array.isArray(json) ? json.map((i) => String((i as { name?: unknown })?.name ?? "")) : [];
}

/**
 * Whether a recipe fits the user's rules as they are NOW. Checks both the recipe's tags and its real
 * ingredient names, because the tags can miss things.
 */
export function recipeFits(
  recipe: { allergens: string[]; diets: string[]; ingredients: unknown },
  profile: SafetyProfile,
): boolean {
  const allergies = new Set(normalizeAllergies(profile.allergies));
  if (recipe.allergens.some((a) => allergies.has(a.trim().toLowerCase()))) return false;
  const diet = profile.diet?.trim().toLowerCase();
  if (diet && !recipe.diets.some((d) => d.trim().toLowerCase() === diet)) return false;
  return !namesBreakRules(ingredientNamesOf(recipe.ingredients), profile);
}

/**
 * A user's AI-modified version of a recipe (stored on the plan entry) can also stop fitting when
 * they add an allergy later. Returns true when the modified ingredients are still fine, or when
 * there is no modification.
 */
export function modificationFits(modified: unknown, profile: SafetyProfile): boolean {
  const ingredients = (modified as { ingredients?: unknown } | null)?.ingredients;
  if (!Array.isArray(ingredients)) return true;
  return !namesBreakRules(ingredientNamesOf(ingredients), profile);
}
