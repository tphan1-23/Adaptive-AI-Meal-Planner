export interface Per100g {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Looks up an ingredient's nutrition per 100 g (from the Ingredient table). */
export type NutritionLookup = (name: string) => Per100g | undefined;

export interface IngredientRow extends Per100g {
  name: string;
}

const normalizeName = (s: string) =>
  s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();

/** "tomatoes" -> "tomato", "berries" -> "berry", "grass" stays. */
const IRREGULAR: Record<string, string> = { halves: "half", leaves: "leaf", loaves: "loaf" };

function singular(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && /(oes|ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

const keyOf = (name: string) =>
  normalizeName(name).split(" ").filter(Boolean).map(singular).join(" ");

/** Words that describe a portion or part rather than the food itself. */
const PORTION_WORDS = new Set([
  "clove", "sprig", "stalk", "slice", "piece", "half", "wedge", "cube", "head", "bunch",
  "leaf", "strip", "chunk", "floret", "stick", "rib",
]);
/** "ground clove", "whole clove": here the portion word is the food. */
const KEEP_PORTION_AFTER = new Set(["ground", "whole", "dried", "dry"]);

/**
 * Candidate names to try for an ingredient, best first: the full name, then with leading
 * words dropped ("ground cumin" -> "cumin"), then with trailing words dropped
 * ("garlic cloves" -> "garlic"). Single words are the last resort of each pass.
 */
export function nameCandidates(name: string): string[] {
  const words = normalizeName(name).split(" ").filter(Boolean).map(singular);
  const out: string[] = [];
  const add = (w: string[]) => {
    const k = w.join(" ");
    if (k && !out.includes(k)) out.push(k);
  };
  const dropLeading = (w: string[]) => {
    for (let i = 0; i < w.length; i++) add(w.slice(i));
  };
  const dropTrailing = (w: string[]) => {
    for (let n = w.length - 1; n >= 1; n--) add(w.slice(0, n));
  };

  // "garlic cloves": the last word is a portion word, so try "garlic" before dropping
  // leading words (which would leave the spice "clove").
  const last = words[words.length - 1];
  const portion = words.length > 1 && PORTION_WORDS.has(last);
  if (portion) {
    const base = words.slice(0, -1);
    add(words);
    dropLeading(base);
    dropTrailing(base);
    // The bare portion word is a real food only after a modifier ("ground cloves").
    if (KEEP_PORTION_AFTER.has(words[words.length - 2])) add([last]);
    return out;
  }
  dropLeading(words);
  dropTrailing(words);
  return out;
}

/** Recipe wording that USDA names differently. Keys and values are normalized names. */
const ALIASES: Record<string, string> = {
  cilantro: "coriander cilantro leave",
  gingerroot: "ginger root",
  scallion: "onion",
  "spring onion": "onion",
  "green onion": "onion",
  chickpea: "chickpea garbanzo bean",
  garbanzo: "chickpea garbanzo bean",
  flour: "all-purpose flour",
  "fresh ginger": "ginger root", // plain "ginger" is the dried spice in the USDA table
};

const ZERO: Per100g = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
/** Foods with no meaningful calories that USDA may not list under these names. */
const ZERO_CALORIE = new Set(["water", "ice"]);

/** Rows whose names agree on calories within this fraction count as one answer. */
const AGREEMENT = 0.15;

/**
 * Builds a lookup over Ingredient rows. Tries, in order:
 * 1. the exact name, then with leading words dropped, then trailing words dropped
 * 2. known aliases ("cilantro")
 * 3. a name that merely contains the words ("flour" -> "all-purpose flour"), but only when
 *    the shortest such names agree on calories, so "rice" or "oil" resolve and an ambiguous
 *    word does not guess
 * The fallbacks can land on a broader food (for example "peanut butter" to "butter" if peanut
 * butter is missing), so this gives nutrition estimates only; allergen checks never rely on it.
 */
export function buildNutritionLookup(rows: IngredientRow[]): NutritionLookup {
  const index = new Map<string, IngredientRow>();
  const entries: { words: string[]; row: IngredientRow }[] = [];
  for (const r of rows) {
    const k = keyOf(r.name);
    if (!k) continue;
    if (!index.has(k)) index.set(k, r);
    entries.push({ words: k.split(" "), row: r });
  }

  const containing = (candidate: string): Per100g | undefined => {
    const want = candidate.split(" ");
    const wantsCooked = want.includes("cooked");
    const hits = entries.filter(
      (e) => want.every((w) => e.words.includes(w)) && (wantsCooked || !e.words.includes("cooked")),
    );
    if (hits.length === 0) return undefined;
    const shortest = Math.min(...hits.map((h) => h.words.length));
    const group = hits.filter((h) => h.words.length === shortest).map((h) => h.row);
    const sorted = [...group].sort((x, y) => x.calories - y.calories);
    const median = sorted[Math.floor(sorted.length / 2)];
    const agrees = group.every((g) => Math.abs(g.calories - median.calories) <= AGREEMENT * Math.max(median.calories, 1));
    return agrees ? median : undefined;
  };

  const cache = new Map<string, Per100g | undefined>();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    const candidates = nameCandidates(name);
    let found: Per100g | undefined;
    for (const c of candidates) {
      found = index.get(c) ?? (ALIASES[c] ? index.get(ALIASES[c]) : undefined);
      if (found) break;
    }
    if (!found) found = candidates.some((c) => ZERO_CALORIE.has(c)) ? ZERO : undefined;
    if (!found) {
      for (const c of candidates) {
        found = containing(ALIASES[c] ?? c);
        if (found) break;
      }
    }
    cache.set(name, found);
    return found;
  };
}

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
