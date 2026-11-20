import { detectAllergens, hasPhrase, normalizeAllergies } from "./allergens";
import { ingredientsHaveAllergen } from "./filter";

/** One USDA ingredient, nutrition per 100 g. */
export interface SubstituteCandidate {
  id: string;
  name: string;
  category: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Substitute {
  name: string;
  category: string | null;
  /** Lower is closer. */
  distance: number;
  /** "close" is a like-for-like swap; "rough" is the best available but noticeably different. */
  quality: "close" | "rough";
  /** Grams of this ingredient that give the same calories as the original amount. */
  grams: number;
  per100g: { calories: number; proteinG: number; carbsG: number; fatG: number };
}

const MEAT_WORDS = [
  "beef", "pork", "chicken", "turkey", "lamb", "veal", "bacon", "ham", "sausage", "duck", "goose",
  "venison", "bison", "rabbit", "liver", "gizzard", "giblet", "steak", "meat", "mutton", "goat",
  "salami", "pepperoni", "hot dog", "frankfurter", "lard", "tallow", "gelatin", "broth", "bouillon", "animal fat",
  "meatball", "meatloaf", "base", "stock",
];

/** Contain a meat word but are not meat. */
const NOT_MEAT = ["goat cheese", "goat milk", "goat s milk", "chicken of the woods", "stock cube vegetable"];

const norm = (s: string) => s.trim().toLowerCase();

/** Words that say a "meat" name is actually meat-free ("vegetable broth", "vegetarian chicken strips"). */
const MEATLESS_MARKERS = [
  "vegetable", "veggie", "vegan", "vegetarian", "meatless", "faux", "imitation", "mock", "plant based", "plant-based",
  "tofu", "seitan", "tempeh", "soy", "substitute", "alternative", "analog", "analogue",
];
/** Whole-word match, so "ham" is not in "champagne" and "liver" is not in "slivered". */
const hasWord = (name: string, words: string[]) => words.some((w) => hasPhrase(name, w));

/** True when a diet forbids this ingredient. Fish and shellfish are caught by the allergen keywords. */
export function violatesDiet(c: Pick<SubstituteCandidate, "name" | "category">, diet: string | null | undefined): boolean {
  const d = diet ? norm(diet) : "";
  if (!d) return false;
  const found = detectAllergens([c.name]);
  // In the USDA table every `protein` row is an animal food (meat, fish, shellfish, eggs), so the
  // category is a safer test than guessing names. Eggs are the one thing vegetarians still eat.
  // Whole-word match so "duck egg" is an egg but "eggplant" is not ("duck" must not make it meat).
  const isEgg = /\beggs?\b/.test(norm(c.name));
  const meatless = hasWord(c.name, MEATLESS_MARKERS) || hasWord(c.name, NOT_MEAT);
  const animal = isEgg || meatless
    ? false
    : c.category === "protein" ||
      hasWord(c.name, MEAT_WORDS) ||
      found.includes("fish") ||
      found.includes("shellfish");

  if (d === "vegetarian") return animal;
  if (d === "vegan") {
    return (
      animal || isEgg || c.category === "protein" || c.category === "dairy" ||
      found.includes("dairy") || hasWord(c.name, ["honey"])
    );
  }
  if (d === "dairy-free") return c.category === "dairy" || found.includes("dairy");
  if (d === "gluten-free") return found.includes("gluten");
  return false;
}

export interface SubstituteOptions {
  allergies: string[];
  diet?: string | null;
  limit?: number;
}

/** Closeness of two foods by calories and macros: relative differences, lower is closer. */
export function macroDistance(a: SubstituteCandidate, b: SubstituteCandidate): number {
  const rel = (x: number, y: number, floor: number) => Math.abs(x - y) / (Math.max(x, y) + floor);
  return (
    rel(a.calories, b.calories, 20) +
    rel(a.proteinG, b.proteinG, 3) +
    rel(a.carbsG, b.carbsG, 3) +
    rel(a.fatG, b.fatG, 3)
  );
}

/** Beyond this the foods are not really interchangeable, so nothing is suggested. */
const MAX_DISTANCE = 1;
/** At or below this a swap counts as close. */
const CLOSE_DISTANCE = 0.5;

const MIN_GRAMS = 20;
const MAX_GRAMS = 400;

/**
 * The closest real ingredients to swap for `target`, found by nearest-neighbor search on
 * nutrition. Candidates stay in the target's category, never contain the user's allergens
 * (checked on the ingredient name) and respect their diet. This is the source of truth for
 * "is this a good swap"; the AI only words the result.
 *
 * `originalGrams` is how much of the original the recipe uses, so each result also says how much
 * of the substitute keeps the calories the same.
 */
export function findSubstitutes(
  target: SubstituteCandidate,
  candidates: SubstituteCandidate[],
  opts: SubstituteOptions,
  originalGrams = 100,
): Substitute[] {
  const allergies = normalizeAllergies(opts.allergies);
  const targetName = norm(target.name);

  const out: Substitute[] = [];
  for (const c of candidates) {
    if (c.id === target.id || norm(c.name) === targetName) continue;
    if (target.category && c.category !== target.category) continue;
    if (c.calories <= 0 && target.calories > 0) continue;
    if (ingredientsHaveAllergen([c.name], allergies)) continue;
    if (violatesDiet(c, opts.diet)) continue;
    const distance = Math.round(macroDistance(target, c) * 1000) / 1000;
    if (distance > MAX_DISTANCE) continue;

    const wantedCalories = (target.calories * originalGrams) / 100;
    const grams = c.calories > 0 ? Math.round(Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, (wantedCalories / c.calories) * 100))) : originalGrams;
    out.push({
      name: c.name,
      category: c.category,
      distance,
      quality: distance <= CLOSE_DISTANCE ? "close" : "rough",
      grams,
      per100g: { calories: c.calories, proteinG: c.proteinG, carbsG: c.carbsG, fatG: c.fatG },
    });
  }
  return out.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name)).slice(0, opts.limit ?? 3);
}

/** Plain-language fallback when the AI is unavailable. */
export function describeSubstitute(original: SubstituteCandidate, s: Substitute, originalGrams = 100): string {
  const protein = Math.round(s.per100g.proteinG - original.proteinG);
  const proteinNote =
    Math.abs(protein) < 2 ? "with similar protein" : protein > 0 ? "with more protein" : "with less protein";
  return `Swap ${original.name} for about ${s.grams} g of ${s.name} (instead of ${Math.round(originalGrams)} g), ${proteinNote} and about the same calories.`;
}
