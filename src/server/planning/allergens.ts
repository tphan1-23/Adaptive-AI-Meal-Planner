/**
 * Canonical allergen vocabulary. These are exactly the labels the recipe import writes to
 * `Recipe.allergens`, so a profile allergy must be normalized to one of them to match.
 */
export const ALLERGENS = [
  "gluten", "dairy", "soy", "egg", "sesame", "fish", "shellfish", "tree-nut", "peanut",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

const ALIASES: Record<string, Allergen> = {
  wheat: "gluten", celiac: "gluten", coeliac: "gluten",
  milk: "dairy", lactose: "dairy", cheese: "dairy",
  soya: "soy", soybean: "soy", soybeans: "soy",
  eggs: "egg",
  seafood: "shellfish", shrimp: "shellfish", crab: "shellfish", lobster: "shellfish",
  nut: "tree-nut", nuts: "tree-nut", "tree nut": "tree-nut", "tree nuts": "tree-nut", treenut: "tree-nut", treenuts: "tree-nut",
  peanuts: "peanut", groundnut: "peanut",
};

/** Words that reveal an allergen in an ingredient name (used to re-check AI-written recipes). */
const KEYWORDS: Record<Allergen, string[]> = {
  gluten: ["wheat", "flour", "bread", "pasta", "noodle", "barley", "rye", "couscous", "semolina", "bulgur", "seitan", "cracker", "tortilla"],
  dairy: ["milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "whey", "ghee", "custard", "buttermilk"],
  soy: ["soy", "tofu", "tempeh", "edamame", "miso"],
  egg: ["egg", "mayonnaise", "meringue"],
  sesame: ["sesame", "tahini"],
  fish: [
    "fish", "salmon", "tuna", "cod", "anchovy", "anchovies", "sardine", "trout", "tilapia", "halibut", "bass", "snapper",
    "mackerel", "herring", "perch", "pike", "swordfish", "catfish", "carp", "eel", "mahi", "pollock", "haddock", "flounder",
    "sole", "sturgeon", "roe", "caviar", "grouper", "whiting", "bonito", "smelt", "shad", "pompano", "tilefish", "sablefish",
  ],
  shellfish: [
    "shrimp", "prawn", "crab", "lobster", "clam", "mussel", "oyster", "scallop", "crayfish", "crawfish", "squid", "octopus",
    "calamari", "abalone", "conch", "cuttlefish", "snail", "escargot", "krill", "langoustine", "shellfish",
  ],
  "tree-nut": ["almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut", "macadamia", "pine nut", "brazil nut"],
  peanut: ["peanut", "groundnut"],
};

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Maps user-entered allergy names to canonical labels. Unknown names are kept as typed. */
export function normalizeAllergies(allergies: string[]): string[] {
  const out = new Set<string>();
  for (const raw of allergies) {
    const a = clean(raw);
    if (!a) continue;
    out.add((ALLERGENS as readonly string[]).includes(a) ? a : ALIASES[a] ?? a);
  }
  return [...out];
}

/** Keywords to look for in ingredient names for the given allergies (canonical and as typed). */
export function allergyKeywords(allergies: string[]): string[] {
  const kws = new Set<string>();
  for (const a of normalizeAllergies(allergies)) {
    kws.add(a);
    for (const k of KEYWORDS[a as Allergen] ?? []) kws.add(k);
  }
  return [...kws];
}

/** Canonical allergens that appear to be in a list of ingredient names (for AI-written recipes). */
export function detectAllergens(ingredientNames: string[]): Allergen[] {
  const names = ingredientNames.map(clean);
  return ALLERGENS.filter((a) => KEYWORDS[a].some((k) => names.some((n) => n.includes(k))));
}
