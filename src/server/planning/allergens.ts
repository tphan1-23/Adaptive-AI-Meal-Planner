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

/**
 * Words that reveal an allergen in an ingredient name. Matched as whole words (plurals ignored),
 * so "peel" is not "eel" and "eggplant" is not "egg". Used to re-check recipes and AI output.
 */
const KEYWORDS: Record<Allergen, string[]> = {
  gluten: [
    "wheat", "flour", "bread", "breadcrumb", "pasta", "noodle", "spaghetti", "macaroni", "lasagna", "barley", "rye",
    "couscous", "semolina", "bulgur", "seitan", "cracker", "tortilla", "pita", "bun", "farro", "spelt",
    "tortellini", "ravioli", "gnocchi", "fettuccine", "linguine", "penne", "rigatoni", "orzo", "ziti", "vermicelli",
    "tagliatelle", "rotini", "fusilli", "manicotti", "cannelloni",
  ],
  dairy: [
    "milk", "cheese", "butter", "cream", "yogurt", "yoghurt", "whey", "ghee", "custard", "buttermilk", "casein",
    "parmesan", "mozzarella", "cheddar", "ricotta", "feta", "gruyere", "fontina", "mascarpone", "brie", "camembert",
    "provolone", "gouda", "kefir", "half and half",
  ],
  soy: ["soy", "soya", "soybean", "soyabean", "soymilk", "tofu", "tempeh", "edamame", "miso"],
  egg: ["egg", "mayonnaise", "mayo", "meringue"],
  sesame: ["sesame", "tahini"],
  fish: [
    "fish", "salmon", "tuna", "cod", "anchovy", "anchovies", "sardine", "trout", "tilapia", "halibut", "bass", "snapper",
    "mackerel", "herring", "perch", "pike", "swordfish", "catfish", "carp", "eel", "mahi", "mahimahi", "pollock", "pollack",
    "haddock", "flounder", "sole", "sturgeon", "roe", "caviar", "grouper", "whiting", "bonito", "smelt", "shad", "pompano",
    "tilefish", "sablefish", "butterfish", "whitefish",
  ],
  shellfish: [
    "shrimp", "prawn", "crab", "crabmeat", "lobster", "clam", "mussel", "oyster", "scallop", "crayfish", "crawfish", "squid",
    "octopus", "calamari", "abalone", "conch", "cuttlefish", "snail", "escargot", "krill", "langoustine", "shellfish",
  ],
  "tree-nut": ["almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut", "macadamia", "pine nut", "brazil nut"],
  peanut: ["peanut", "groundnut"],
};

/** Plant-based versions of dairy foods ("almond milk", "soy yogurt") are not dairy. */
const PLANTS = ["soy", "almond", "coconut", "oat", "rice", "cashew", "hemp", "pea", "macadamia", "hazelnut"];
const DAIRY_FORMS = ["milk", "yogurt", "yoghurt", "cheese", "cream", "butter", "creamer", "ice cream", "kefir"];
const PLANT_DAIRY = PLANTS.flatMap((p) => DAIRY_FORMS.map((d) => `${p} ${d}`));

/**
 * Look-alikes that are NOT the allergen, removed before matching. Without these "peanut butter"
 * counts as dairy and "rice noodles" as gluten.
 */
const NOT_THE_ALLERGEN: Partial<Record<Allergen, string[]>> = {
  dairy: [
    ...PLANT_DAIRY,
    "peanut butter", "almond butter", "cashew butter", "nut butter", "seed butter", "sunflower butter", "cocoa butter",
    "shea butter", "apple butter", "coconut milk", "coconut cream", "almond milk", "oat milk", "rice milk", "soy milk",
    "cream of tartar", "butternut", "ice cream cone",
  ],
  gluten: [
    "rice noodle", "rice flour", "corn flour", "cornflour", "almond flour", "coconut flour", "potato flour",
    "tapioca flour", "chickpea flour", "cassava flour", "bean thread noodle", "bean thread", "glass noodle", "cellophane noodle",
    "gluten free", "gluten-free", "buckwheat flour", "corn tortilla", "corn taco shell", "corn chip",
  ],
};

/** A "...-free" label on the ingredient name, per allergen ("gluten-free", "dairy free", "non-dairy"). */
const FREE_OF: Record<Allergen, RegExp> = {
  gluten: /\bgluten[ -]?free\b/,
  dairy: /\b(dairy|lactose)[ -]?free\b|\bnon[ -]?dairy\b|\bvegan\b/,
  soy: /\bsoy[ -]?free\b/,
  egg: /\begg[ -]?free\b|\bvegan\b/,
  sesame: /\bsesame[ -]?free\b/,
  fish: /\bfish[ -]?free\b/,
  shellfish: /\bshellfish[ -]?free\b/,
  "tree-nut": /\b(tree[ -]?)?nut[ -]?free\b/,
  peanut: /\bpeanut[ -]?free\b/,
};

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "almonds" -> "almond", "anchovies" -> "anchovy", "glass" stays. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(oes|ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Lowercase words of an ingredient name, singular, padded so whole phrases can be searched. */
function wordsOf(name: string): string {
  const words = clean(name).replace(/[^a-z\s]/g, " ").split(" ").filter(Boolean).map(singular);
  return ` ${words.join(" ")} `;
}

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

/**
 * True if an ingredient name contains the allergen: a canonical label ("dairy") or an unknown
 * allergy as typed ("kiwi"). Whole-word matching with exceptions for safe look-alikes.
 */
export function ingredientHasAllergen(ingredientName: string, allergen: string): boolean {
  const a = clean(allergen);
  const canonical = (ALLERGENS as readonly string[]).includes(a) ? (a as Allergen) : null;

  // "gluten-free pasta", "dairy free cheese": the label says the allergen is not in it.
  if (canonical && FREE_OF[canonical].test(clean(ingredientName))) return false;

  let text = wordsOf(ingredientName);
  for (const phrase of canonical ? NOT_THE_ALLERGEN[canonical] ?? [] : []) {
    text = text.split(wordsOf(phrase)).join(" ");
  }
  const keywords = canonical ? KEYWORDS[canonical] : [a];
  return keywords.some((k) => text.includes(wordsOf(k)));
}

/** True if any ingredient name contains any of the user's allergens (aliases are normalized first). */
export function anyIngredientHasAllergen(ingredientNames: string[], allergies: string[]): boolean {
  const list = normalizeAllergies(allergies);
  return ingredientNames.some((n) => list.some((a) => ingredientHasAllergen(n, a)));
}

/** Canonical allergens that appear to be in a list of ingredient names. */
export function detectAllergens(ingredientNames: string[]): Allergen[] {
  return ALLERGENS.filter((a) => ingredientNames.some((n) => ingredientHasAllergen(n, a)));
}

/** True if the ingredient name contains the word or phrase as whole words ("liver" is not in "slivered"). */
export function hasPhrase(ingredientName: string, phrase: string): boolean {
  return wordsOf(ingredientName).includes(wordsOf(phrase));
}
