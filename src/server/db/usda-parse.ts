import { normalizeName } from "../shopping-list/aggregate";

// Helpers for the one-time USDA FoodData Central (SR Legacy) import.
// USDA descriptions look like "Chicken, broilers or fryers, breast, meat only, raw".
// Our recipes and the AI use plain names ("chicken breast"), so we simplify them.

/** Our coarse categories. Substitutions stay inside one category. */
export type IngredientCategory =
  | "protein" | "dairy" | "grain" | "vegetable" | "fruit" | "fat" | "legume" | "nut-seed" | "spice" | "sweetener";

/** USDA food_category description -> our category. Anything not listed is not imported. */
export const CATEGORY_MAP: Record<string, IngredientCategory> = {
  "Poultry Products": "protein",
  "Pork Products": "protein",
  "Beef Products": "protein",
  "Lamb, Veal, and Game Products": "protein",
  "Finfish and Shellfish Products": "protein",
  "Dairy and Egg Products": "dairy",
  "Cereal Grains and Pasta": "grain",
  "Baked Products": "grain",
  "Vegetables and Vegetable Products": "vegetable",
  "Fruits and Fruit Juices": "fruit",
  "Fats and Oils": "fat",
  "Legumes and Legume Products": "legume",
  "Nut and Seed Products": "nut-seed",
  "Spices and Herbs": "spice",
  "Sweets": "sweetener", // narrowed to sugar / honey / syrup by isUsefulSweet()
};

/** USDA nutrient ids we need (all per 100 g). */
export const NUTRIENT = { kcal: 1008, protein: 1003, fat: 1004, carbs: 1005 } as const;

// Parts of a description that add no useful meaning for matching.
const NOISE = [
  /^raw$/, /^cooked/, /^boiled/, /^roasted/, /^fried/, /^baked/, /^broiled/, /^grilled/, /^braised/,
  /^stewed/, /^steamed/, /^canned/, /^frozen/, /^dried/, /^dry$/, /^drained/, /^without /, /^with /,
  /^unenriched/, /^enriched/, /^all varieties/, /^commercial/, /^regular/, /^includes /, /^ns as/,
  /\d/, /%/, /separable/, /^meat only/, /^meat and skin/, /^skin only/, /^trimmed/, /^untrimmed/,
  /^usda/, /^imitation/, /^prepared/, /^unprepared/, /^solids/, /^heated/, /^stir-fried/, /^microwaved/,
  /^pan-fried/, /^composite/, /^select/, /^choice/, /^prime/, /^all grades/, /^lean/, /^bone/,
  /^year round/, /^mature seeds/, /^salted/, /^unsalted/, /^large/, /^small/, /^medium/, /^whole$/,
  /^broilers? or fryers?/, /^roasting/, /^stewing/, /^young/, /^spring/, /^fresh/, /^natural/,
];

const POULTRY_MEAT = new Set(["chicken", "turkey", "duck", "goose", "quail"]);
const MEATS = new Set(["beef", "pork", "lamb", "veal", "bison", "game meat", ...POULTRY_MEAT]);

export type Preparation = "raw" | "cooked" | "other";

export function preparationOf(description: string): Preparation {
  const d = description.toLowerCase();
  if (/\b(cooked|boiled|roasted|fried|baked|broiled|grilled|braised|stewed|steamed)\b/.test(d)) return "cooked";
  if (/\braw\b/.test(d)) return "raw";
  return "other";
}

const SPICE_COLOURS = new Set(["black", "white", "red", "green"]);

/** "Oil, olive, salad or cooking" -> "olive oil"; "Beef, ground, 85% lean, raw" -> "ground beef". */
export function simplifyName(description: string): string {
  const d = description.toLowerCase();
  const parts = d.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";
  const base = parts[0];
  const rest = parts.slice(1).filter((p) => !NOISE.some((re) => re.test(p)));
  const q = rest[0];

  let name: string;
  if (base === "oil") name = q ? `${q} oil` : "oil";
  else if (base === "spices" || base === "herbs") {
    // "Spices, pepper, black" -> "black pepper"; "Spices, cinnamon, ground" -> "cinnamon"
    name = q ? (rest[1] && SPICE_COLOURS.has(rest[1]) ? `${rest[1]} ${q}` : q) : base;
  } else if (base === "sugars") name = q ? `${q} sugar` : "sugar";
  else if (base.endsWith("flour") && /all-purpose/.test(d)) name = "all-purpose flour";
  else if (base.endsWith("flour") && /bread flour|bread, /.test(d)) name = "bread flour";
  else if (POULTRY_MEAT.has(base)) name = q ? `${base} ${q}` : base; // chicken breast
  else if (MEATS.has(base)) name = q ? `${q} ${base}` : base; // ground beef
  else if (base === "fish" || base === "crustaceans" || base === "mollusks") name = q ?? base;
  else if (base === "nuts" || base === "seeds") name = q ?? base;
  else name = q && q.split(" ").length <= 2 && ["cheese", "milk", "butter", "cream", "yogurt", "rice", "pasta", "flour", "bread", "beans"].includes(base) ? `${q} ${base}` : base;

  return name.replace(/\s+/g, " ").replace(/[^a-z0-9 '-]/g, "").trim();
}

/** Display name for the Ingredient row; cooked versions are marked so grams are not confused. */
export function ingredientName(description: string): string {
  const base = simplifyName(description);
  if (!base) return "";
  // normalizeName is the same function the shopping list uses, so lookups can normalize
  // a recipe's ingredient text the same way and find an exact match.
  const clean = normalizeName(base);
  return preparationOf(description) === "cooked" ? `cooked ${clean}` : clean;
}

/** Eggs live under "Dairy and Egg Products" in USDA but are a protein for substitution purposes. */
export function categoryFor(description: string, usda: IngredientCategory): IngredientCategory {
  return /^egg\b/i.test(description) ? "protein" : usda;
}

/** Brand-name and commodity rows are noise for a home-cooking planner. */
export function isBrandOrJunk(description: string): boolean {
  return /^[A-Z]{3,}/.test(description) || /\b(USDA Commodity|Pillsbury|Kraft|Vitasoy|Nasoya|Silk|Archer Daniels|Mori-Nu|Campbell|Heinz|Nabisco|Keebler)\b/i.test(description);
}

/** From the Sweets category, only keep everyday cooking sweeteners. */
export function isUsefulSweet(description: string): boolean {
  return /^(sugars?|honey|molasses|syrups?, (maple|corn|table blends))\b/i.test(description);
}

/** Rank candidates that simplify to the same name: raw first, then the shortest description. */
export function preferenceScore(description: string): number {
  const p = preparationOf(description);
  return (p === "raw" ? 0 : p === "other" ? 1000 : 2000) + description.length;
}
