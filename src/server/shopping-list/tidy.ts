// Cleans up ingredient names for the shopping list, in code (no AI): the same product written many ways
// ("garlic clove", "garlic cloves", "minced garlic") becomes one name, combined seasoning lines are split,
// and every name gets a store aisle and a "pantry basics" flag. Pure functions, covered by tests.

export type Aisle = "produce" | "meat" | "seafood" | "dairy" | "bakery" | "pantry" | "spices" | "frozen" | "other";

/** Order the aisles are shown in. */
export const AISLE_ORDER: Aisle[] = ["produce", "meat", "seafood", "dairy", "bakery", "frozen", "pantry", "spices", "other"];

// ---------- name cleanup ----------

/** Words that describe preparation or quality, not what to buy. */
const DESCRIPTORS = new Set([
  "fresh", "freshly", "large", "small", "medium", "chopped", "minced", "diced", "sliced", "shredded", "grated",
  "melted", "softened", "boneless", "skinless", "cooked", "uncooked", "raw", "finely", "roughly", "coarsely",
  "thinly", "optional", "lean", "extra", "virgin", "extra-virgin", "kosher", "real", "homemade", "prepared",
  "unsalted", "salted", "plain", "low-fat", "lowfat", "nonfat", "non-fat", "reduced-fat", "fat-free", "low-sodium",
  "pure", "good", "quality", "ripe", "packed", "firmly", "divided", "taste", "about", "plus", "more", "serving",
  "garnish", "drained", "rinsed", "peeled", "seeded", "trimmed", "halved", "cubed", "cracked", "coarse", "toasted",
  "of", "to", "for", "and", "or", "a", "the", "with",
]);

/** Plural words that do not follow the "drop the s" rule. */
const IRREGULAR: Record<string, string> = {
  leaves: "leaf", halves: "half", loaves: "loaf", knives: "knife", chilies: "chili", chiles: "chile",
  tomatoes: "tomato", potatoes: "potato", mangoes: "mango", anchovies: "anchovy", cookies: "cookie",
  brownies: "brownie", veggies: "veggie", smoothies: "smoothie", pies: "pie",
};
const KEEP_AS_IS = new Set(["molasses", "hummus", "couscous", "asparagus", "grits", "swiss", "watercress", "citrus", "chives", "brussels", "hash"]);

function singular(w: string): string {
  if (w.length <= 3 || KEEP_AS_IS.has(w)) return w;
  if (IRREGULAR[w]) return IRREGULAR[w];
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ches|shes|xes|zzes)$/.test(w)) return w.slice(0, -2); // peaches, radishes, boxes
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y"; // berries, cherries
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** A trailing word that only says how it is cut or packed ("garlic clove", "chicken breast half"). */
const PORTION = new Set(["leaf", "clove", "sprig", "stalk", "bunch", "wedge", "half", "fillet", "slice", "floret"]);

const MEATS = new Set(["beef", "pork", "turkey", "chicken", "lamb", "sausage", "veal", "bison"]);

/** Exact rewrites after cleanup. */
const ALIASES: Record<string, string> = {
  pepper: "black pepper", "ground pepper": "black pepper", "pepper ground": "black pepper", "black pepper ground": "black pepper",
  "sea salt": "salt", "table salt": "salt", "salt kosher": "salt",
  "vegetable oil": "cooking oil", "canola oil": "cooking oil", "corn oil": "cooking oil", oil: "cooking oil", "salad oil": "cooking oil",
  "olive oil": "olive oil",
  scallion: "green onion", "spring onion": "green onion", "yellow onion": "onion", "white onion": "onion", "brown onion": "onion",
  "sweet onion": "onion", "spanish onion": "onion",
  "plum tomato": "tomato", "roma tomato": "tomato", "vine tomato": "tomato", "beefsteak tomato": "tomato",
  cayenne: "cayenne pepper", "red cayenne pepper": "cayenne pepper", "cayenne pepper": "cayenne pepper",
  "crushed red pepper flake": "red pepper flakes", "red pepper flake": "red pepper flakes", "chili flake": "red pepper flakes",
  "chile flake": "red pepper flakes", "crushed chili flake": "red pepper flakes", "pepper flake": "red pepper flakes",
  "all-purpose flour": "flour", "all purpose flour": "flour", "plain flour": "flour",
  "granulated sugar": "sugar", "white sugar": "sugar", "caster sugar": "sugar",
  "homemade chicken stock": "chicken broth", "chicken stock": "chicken broth", "beef stock": "beef broth", "vegetable stock": "vegetable broth",
  parmesan: "parmesan cheese", "parmigiano reggiano": "parmesan cheese", "parmigiano-reggiano": "parmesan cheese",
  mozzarella: "mozzarella cheese", cheddar: "cheddar cheese", ricotta: "ricotta cheese", feta: "feta cheese",
  "mince beef": "ground beef", "beef mince": "ground beef", "extra lean ground beef": "ground beef",
  "light cream": "light cream", "half-and-half": "half-and-half", "half and half": "half-and-half",
  "dijon mustard": "dijon mustard", "yellow mustard": "yellow mustard",
  "coriander leaf": "cilantro", "fresh coriander": "cilantro",
  "green chili": "green chili", "green chile": "green chili",
};

/** "salt and pepper" style lines name two things. Everything left after removing these words must be empty. */
const SEASONING_WORDS = new Set(["salt", "pepper", "black", "white", "and", "&", "fresh", "freshly", "ground", "kosher", "sea", "to", "taste", "cracked", "coarse", "table"]);

/**
 * One raw ingredient line -> one or more clean names. Most lines give one name; "salt and pepper" gives two.
 * Returns [] for a line with no usable name.
 */
export function canonicalNames(raw: string): string[] {
  const text = raw.toLowerCase().replace(/\(.*?\)/g, " ").replace(/&/g, " and ");
  const rawWords = text.replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  // "salt and pepper", "salt freshly ground black pepper", "kosher salt and pepper to taste"
  if (rawWords.includes("salt") && rawWords.includes("pepper") && rawWords.every((w) => SEASONING_WORDS.has(w))) {
    return ["salt", "black pepper"];
  }

  let words = rawWords.filter((w) => !DESCRIPTORS.has(w)).map(singular);

  // "lemon juice and zest of" -> lemon (you buy the fruit)
  if ((words[0] === "lemon" || words[0] === "lime") && words.some((w) => w === "juice" || w === "zest" || w === "peel")) {
    return [words[0]];
  }
  // "ground cumin" -> cumin, but "ground beef" stays ground beef
  if (words.includes("ground") && !words.some((w) => MEATS.has(w))) words = words.filter((w) => w !== "ground");
  // "garlic clove", "basil leaf", "chicken breast half" -> the product itself
  while (words.length > 1 && PORTION.has(words[words.length - 1])) words = words.slice(0, -1);
  if (words.length > 1 && words[0] === "all-purpose") words = words.slice(1);
  if (words.length === 0) return [rawWords.join(" ")];

  let name = words.join(" ");
  // milk types, whole/skim/2% -> milk
  name = name.replace(/^(whole|skim|skimmed|2|1|nonfat|lowfat) milk$/, "milk");
  name = ALIASES[name] ?? name;
  // Varieties of one thing you would buy once.
  name = name
    .replace(/^(sharp|mild|extra sharp|extra-sharp|white|aged|smoked|medium) cheddar( cheese)?$/, "cheddar cheese")
    .replace(/^(italian|flat-leaf|flat leaf|curly) parsley$/, "parsley")
    .replace(/^(heavy|whipping|heavy whipping) cream$/, "heavy cream")
    .replace(/^(cold|warm|hot|boiling|lukewarm|ice|iced) water$/, "water")
    .replace(/^celery (rib|stalk|stick)$/, "celery")
    .replace(/^whole chicken breast$/, "chicken breast")
    .replace(/^((soft|small|large|taco-size|taco size|burrito-size) )+(.*tortilla)$/, "$3");
  return name ? [name] : [];
}

/** The first clean name of a line (kept for callers that want a single name). */
export function normalizeName(raw: string): string {
  return canonicalNames(raw)[0] ?? raw.trim().toLowerCase();
}

// ---------- aisles and pantry basics ----------

/** Things most kitchens already have. Shown apart from "to buy" so they don't bury the real list. */
const STAPLES = new Set(["salt", "black pepper", "water", "ice", "ice cube", "cooking oil", "olive oil", "sugar", "flour", "cooking spray", "baking powder", "baking soda"]);
export const isStaple = (name: string) => STAPLES.has(name);

const has = (name: string, re: RegExp) => re.test(name);

export function aisleOf(name: string): Aisle {
  const n = name;
  if (has(n, /\b(tortilla|pita|naan|bagel|bun|baguette|croissant)\b/)) return "bakery"; // before "flour tortilla" reads as flour
  if (has(n, /\b(broth|stock|sauce|paste|noodle|pasta|spaghetti|macaroni|penne|lasagna|rice|flour|sugar|oil|vinegar|honey|syrup|mustard|mayonnaise|ketchup|wine|bean|lentil|chickpea|breadcrumb|bread crumb|cornstarch|baking|extract|jam|jelly|peanut butter|almond butter|coconut milk|almond milk|oat|cereal|cracker|chip|nut|seed|olive|caper|pickle|salsa|tahini|sun-dried|brandy|merlot|burgundy|sherry|rum|vodka|whiskey|beer|liqueur|cider|creme de menthe|gelatin|yeast|shortening|soup|barley|cocoa|chocolate|jelly|pan dripping)\b/) && !has(n, /\b(green bean|bean sprout)\b/)) return "pantry";
  if (has(n, /\bfrozen\b/)) return "frozen";
  if (has(n, /\b(shrimp|salmon|fish|tuna|cod|crab|lobster|scallop|tilapia|clam|mussel|anchovy|prawn|halibut|trout)\b/)) return "seafood";
  if (has(n, /\b(chicken|beef|pork|sausage|bacon|ham|turkey|lamb|steak|pancetta|prosciutto|meatball|rib|veal|chorizo|salami|pepperoni|hot dog)\b/)) return "meat";
  if (has(n, /\b(milk|cheese|butter|cream|yogurt|yoghurt|egg|half-and-half|crema|margarine|ricotta|parmesan|mozzarella|cheddar|feta|brie|gorgonzola|mascarpone|kefir)\b/)) return "dairy";
  if (has(n, /\b(bread|tortilla|bun|roll|pita|bagel|naan|baguette|croissant|muffin|dough|crust)\b/)) return "bakery";
  if (has(n, /\b(powder|flakes?|cumin|oregano|paprika|cinnamon|nutmeg|turmeric|cayenne|thyme|rosemary|sage|bay|coriander|curry|allspice|seasoning|salt|black pepper|white pepper|peppercorn|dried|dill weed|cardamom|saffron|vanilla)\b/)) return "spices";
  if (has(n, /\b(onion|garlic|tomato|potato|carrot|celery|lettuce|spinach|kale|cabbage|broccoli|cauliflower|zucchini|squash|cucumber|mushroom|pepper|chili|chile|jalapeno|poblano|serrano|lemon|lime|orange|apple|banana|berry|avocado|basil|parsley|cilantro|mint|dill|chive|ginger|shallot|leek|corn|pea|eggplant|asparagus|beet|radish|fruit|grape|pear|peach|mango|pineapple|melon|arugula|cress|herb|sprout|turnip|yam|pumpkin|fennel|artichoke|okra|jicama|tomatillo|plantain)\b/)) return "produce";
  return "other";
}
