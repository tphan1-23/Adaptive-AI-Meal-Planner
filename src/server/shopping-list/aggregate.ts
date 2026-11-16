// Pure shopping-list logic: merge the ingredients of a week's meals into one deduplicated list.
//
// Food.com ingredients have names only, so dataset recipes carry the placeholder
// { quantity: 1, unit: "item" }. Summing those gives "how many times you need it".
// Recipes with real quantities (e.g. AI-modified ones) are summed per unit family.

export interface IngredientLine {
  name: string;
  quantity: number;
  unit: string;
}

export interface MealIngredients {
  /** One planned meal (a PlanEntry). The same recipe on two days is two meals. */
  mealId: string;
  ingredients: IngredientLine[];
}

export interface ShoppingItem {
  name: string;
  quantity: number;
  unit: string;
  /** In how many planned meals this item appears. */
  mealCount: number;
}

// ---------- Names ----------
const DESCRIPTORS = new Set([
  "fresh", "large", "small", "medium", "chopped", "minced", "diced", "sliced", "shredded",
  "grated", "melted", "softened", "boneless", "skinless", "cooked", "uncooked", "raw",
  "finely", "roughly", "coarsely", "thinly", "optional",
]);

export function normalizeName(raw: string): string {
  const words = raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop "(optional)", "(14 oz)"
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !DESCRIPTORS.has(w));
  if (!words.length) return raw.trim().toLowerCase();
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(" ");
}

const KEEP_AS_IS = new Set(["molasses", "hummus", "couscous", "asparagus", "grits", "swiss", "watercress", "citrus"]);

function singular(w: string): string {
  if (w.length <= 3 || KEEP_AS_IS.has(w)) return w;
  if (/(ss|us|is)$/.test(w)) return w; // molasses, hummus, asparagus-like
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

// ---------- Units ----------
const MASS_TO_G: Record<string, number> = { g: 1, gram: 1, kg: 1000, kilogram: 1000, oz: 28.35, ounce: 28.35, lb: 453.6, pound: 453.6 };
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, milliliter: 1, l: 1000, liter: 1000, tsp: 4.93, teaspoon: 4.93,
  tbsp: 14.79, tablespoon: 14.79, cup: 236.6, "fl oz": 29.57,
};
const COUNT_UNITS = new Set(["", "item", "piece", "whole", "each"]);

export function normalizeUnit(rawUnit: string, quantity: number): { quantity: number; unit: string } {
  let u = (rawUnit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (u.endsWith("s") && !["fl oz", "oz"].includes(u)) u = u.slice(0, -1);
  if (COUNT_UNITS.has(u)) return { quantity, unit: "item" };
  if (u in MASS_TO_G) return { quantity: quantity * MASS_TO_G[u], unit: "g" };
  if (u in VOLUME_TO_ML) return { quantity: quantity * VOLUME_TO_ML[u], unit: "ml" };
  return { quantity, unit: u }; // clove, can, bunch, ...
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Aggregation ----------
export function aggregateIngredients(meals: MealIngredients[]): ShoppingItem[] {
  const map = new Map<string, ShoppingItem & { meals: Set<string> }>();

  for (const meal of meals) {
    for (const line of meal.ingredients) {
      if (!line?.name || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      const name = normalizeName(line.name);
      if (!name) continue;
      const { quantity, unit } = normalizeUnit(line.unit, line.quantity);
      const key = `${name}|${unit}`;
      const item = map.get(key) ?? { name, quantity: 0, unit, mealCount: 0, meals: new Set<string>() };
      item.quantity += quantity;
      item.meals.add(meal.mealId);
      map.set(key, item);
    }
  }

  return [...map.values()]
    .map(({ meals: m, ...item }) => ({ ...item, quantity: round2(item.quantity), mealCount: m.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
