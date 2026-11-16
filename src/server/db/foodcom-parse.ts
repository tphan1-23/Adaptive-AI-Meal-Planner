import type { Allergen, Cuisine, Diet, Equipment } from "./vocab";

// ---------- Python-list text columns (e.g. a column holding ['a', "b"]) ----------
export function parsePyList(s: string): string[] {
  const out: string[] = [];
  const str = (s ?? "").trim();
  let i = 0;
  while (i < str.length) {
    const q = str[i];
    if (q === "'" || q === '"') {
      let j = i + 1;
      let buf = "";
      while (j < str.length && str[j] !== q) {
        if (str[j] === "\\" && j + 1 < str.length) {
          buf += str[j + 1];
          j += 2;
        } else {
          buf += str[j++];
        }
      }
      out.push(buf);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

// ---------- Nutrition ----------
// Food.com: [calories, totalFat %DV, sugar %DV, sodium %DV, protein %DV, satFat %DV, carbs %DV]
// %DV references: fat 78 g, protein 50 g, carbs 275 g.
export interface Nutrition {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function parseNutrition(s: string): Nutrition | null {
  const n = (s ?? "").replace(/[\[\]\s]/g, "").split(",").map(Number);
  if (n.length < 7 || n.some((x) => !Number.isFinite(x))) return null;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    calories: r1(n[0]),
    fatG: r1((n[1] * 78) / 100),
    proteinG: r1((n[4] * 50) / 100),
    carbsG: r1((n[6] * 275) / 100),
  };
}

// ---------- Allergens (deliberately over-detects: safer for allergy filtering) ----------
const NON_DAIRY_PHRASES =
  /\b(peanut|almond|cashew|cocoa|coconut|soy|soya|rice|oat|hemp|nut|shea) (butter|milk|cream)\b|\bbutternut\b|\bcream of tartar\b|\bbutterfly\b/g;
const NON_GLUTEN_PHRASES =
  /\b(rice|corn|almond|coconut|tapioca|potato|chickpea|buckwheat|cassava|oat) (flour|noodles?|vermicelli|pasta|starch)\b|\brice (paper|noodles?|vermicelli|sticks?)\b|\bcornflour\b|\bcornstarch\b|\bglass noodles?\b|\bbean thread\b/g;

const ALLERGEN_PATTERNS: Record<Allergen, RegExp> = {
  peanut: /\bpeanuts?\b|\bgroundnuts?\b/,
  "tree-nut": /\b(almonds?|walnuts?|pecans?|cashews?|pistachios?|hazelnuts?|macadamias?|pine nuts?|brazil nuts?|chestnuts?|praline|marzipan|nutella)\b/,
  dairy: /\b(milk|cheese|cheeses|butter|buttermilk|cream|yogh?urt|ghee|whey|casein|half[- ]and[- ]half|mascarpone|ricotta|parmesan|mozzarella|cheddar|feta|paneer|custard|kefir|evaporated|condensed)\b/,
  egg: /\beggs?\b|\bmayo(nnaise)?\b|\bmeringue\b|\bholland?aise\b/,
  gluten: /\b(wheat|flour|bread|breadcrumbs?|panko|pasta|noodles?|spaghetti|macaroni|lasagn?a|penne|fettuccine|linguine|orzo|couscous|barley|rye|semolina|seitan|tortillas?|crackers?|pita|bulgur|beer|soy sauce|tamari|biscuits?|buns?|rolls?|wonton)\b/,
  soy: /\b(soy|soya|soybeans?|tofu|tempeh|edamame|miso|tamari)\b/,
  fish: /\b(fish|salmon|tuna|cod|tilapia|anchov(y|ies)|sardines?|trout|haddock|halibut|mackerel|catfish|snapper|bass|mahi|herring)\b/,
  shellfish: /\b(shrimps?|prawns?|crabs?|lobsters?|clams?|mussels?|oysters?|scallops?|crawfish|crayfish|squid|calamari|octopus)\b/,
  sesame: /\b(sesame|tahini)\b/,
};

export function detectAllergens(ingredients: string[]): Allergen[] {
  const text = ingredients.join(" | ").toLowerCase();
  const dairyText = text.replace(NON_DAIRY_PHRASES, " ");
  const glutenText = text.replace(NON_GLUTEN_PHRASES, " ");
  const found: Allergen[] = [];
  for (const [a, re] of Object.entries(ALLERGEN_PATTERNS) as [Allergen, RegExp][]) {
    const hay = a === "dairy" ? dairyText : a === "gluten" ? glutenText : text;
    if (re.test(hay)) found.push(a);
  }
  return found;
}

// ---------- Diets (conservative: from dataset tags only) ----------
export function detectDiets(tags: string[]): Diet[] {
  const t = new Set(tags);
  const d = new Set<Diet>();
  if (t.has("vegan")) {
    d.add("vegan");
    d.add("vegetarian");
    d.add("dairy-free");
  }
  if (t.has("vegetarian")) d.add("vegetarian");
  if (t.has("gluten-free")) d.add("gluten-free");
  if (t.has("dairy-free")) d.add("dairy-free");
  return [...d];
}

// ---------- Equipment (from step text) ----------
const EQUIPMENT_PATTERNS: Record<Equipment, RegExp> = {
  oven: /\b(oven|bake|baking|roast|broil)\b/,
  stovetop: /\b(stove|stovetop|skillet|saucepan|frying pan|saute|sauté|pot|wok|simmer)\b/,
  microwave: /\bmicrowave\b/,
  grill: /\b(grill|grilled|barbecue|bbq)\b/,
  "slow-cooker": /\b(slow cooker|crock ?pot)\b/,
  "pressure-cooker": /\b(pressure cooker|instant pot)\b/,
  blender: /\b(blender|blend)\b/,
  "food-processor": /\bfood processor\b/,
  "air-fryer": /\bair fryer\b/,
  "stand-mixer": /\b(stand mixer|electric mixer|mixer|beaters?)\b/,
  "rice-cooker": /\brice cooker\b/,
  steamer: /\bsteamer\b|\bsteam(ed|ing)?\b/,
};

export function detectEquipment(steps: string[]): Equipment[] {
  const text = steps.join(" ").toLowerCase();
  return (Object.entries(EQUIPMENT_PATTERNS) as [Equipment, RegExp][])
    .filter(([, re]) => re.test(text))
    .map(([e]) => e);
}

// ---------- Cuisines ----------
const TAG_TO_CUISINE: Record<string, Cuisine> = {
  vietnamese: "vietnamese", russian: "russian", italian: "italian", french: "french",
  asian: "asian", chinese: "chinese", japanese: "japanese", thai: "thai", korean: "korean",
  indian: "indian", filipino: "filipino", indonesian: "indonesian", malaysian: "malaysian",
  caribbean: "caribbean", cuban: "cuban", mexican: "mexican", greek: "greek", spanish: "spanish",
  german: "german", "middle-eastern": "middle-eastern", american: "american",
  "southern-united-states": "american", "southwestern-united-states": "american",
  "northeastern-united-states": "american", midwestern: "american", "pacific-northwest": "american",
};

const ASIAN_SUB = new Set<Cuisine>([
  "chinese", "japanese", "thai", "korean", "indian", "filipino", "indonesian", "malaysian", "vietnamese",
]);

// Food.com has no Dominican or Kazakh tags, so these come from recipe-name keywords.
const NAME_KEYWORDS: Partial<Record<Cuisine, RegExp>> = {
  dominican: /\b(dominican|sancocho|mang[uú]|mofongo|tostones?|habichuelas?|pastel[oó]n|locrio|pernil|sofrito|yuca|plantains?|guandules)\b/,
  kazakh: /\b(kazakh|kazakhstan|beshbarmak|besbarmak|plov|plof|manti|baursak|uzbek|lagman|samsa|samsy|shashlik|shashlyk|pelmeni|central asian)\b/,
  vietnamese: /\b(pho|banh mi|bahn mi|bun cha|vietnamese|nuoc cham|goi cuon|summer rolls?)\b/,
};

export function detectCuisines(name: string, tags: string[]): Cuisine[] {
  const set = new Set<Cuisine>();
  for (const t of tags) {
    const c = TAG_TO_CUISINE[t];
    if (c) set.add(c);
  }
  const lower = name.toLowerCase();
  for (const [c, re] of Object.entries(NAME_KEYWORDS) as [Cuisine, RegExp][]) {
    if (re.test(lower)) set.add(c);
  }
  for (const c of [...set]) if (ASIAN_SUB.has(c)) set.add("asian");
  return [...set];
}

// ---------- Text cleanup ----------
export function cleanName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function cleanStep(step: string): string {
  const s = step.replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Tags that mean "not a meal" for a meal planner.
export const EXCLUDED_TAGS = new Set([
  "beverages", "cocktails", "smoothies", "punch", "drinks-alcohol", "condiments-etc",
  "sauces", "dips", "spreads", "frostings-icing", "jams-and-preserves", "marinades-and-rubs",
  "spice-mixes", "desserts", "cookies-and-brownies", "candy", "cakes", "pies",
]);
