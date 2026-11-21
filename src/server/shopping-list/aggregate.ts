// Pure shopping-list logic: merge the ingredients of a week's meals into one deduplicated list.
//
// Food.com ingredients have names only, so dataset recipes carry the placeholder
// { quantity: 1, unit: "item" }. Summing those gives "how many times you need it".
// Recipes with real quantities (e.g. AI-modified ones) are summed per unit family.
// Names are cleaned in tidy.ts so the same product written differently becomes one item.

import { aisleOf, canonicalNames, isStaple, normalizeName, type Aisle } from "./tidy";

export { normalizeName };

export interface IngredientLine {
  name: string;
  quantity: number;
  unit: string;
}

export interface MealIngredients {
  /** One planned meal (a PlanEntry). The same recipe on two days is two meals. */
  mealId: string;
  /** Recipe name and day, so the list can show "used in". */
  recipe?: string;
  date?: string;
  ingredients: IngredientLine[];
}

export interface UsedIn {
  mealId: string;
  recipe: string;
  date: string;
}

export interface ShoppingItem {
  name: string;
  quantity: number;
  unit: string;
  /** In how many planned meals this item appears. */
  mealCount: number;
  /** Store aisle, for grouping. */
  aisle: Aisle;
  /** True for things most kitchens already have (salt, pepper, oil, sugar, flour, water). */
  staple: boolean;
  /** The meals that need it. */
  usedIn: UsedIn[];
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
  const map = new Map<string, ShoppingItem & { meals: Map<string, UsedIn> }>();

  for (const meal of meals) {
    for (const line of meal.ingredients) {
      if (!line?.name || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      const { quantity, unit } = normalizeUnit(line.unit, line.quantity);
      // One line can name two things ("salt and pepper"); each gets the line's quantity.
      for (const name of canonicalNames(line.name)) {
        const key = `${name}|${unit}`;
        const item =
          map.get(key) ??
          { name, quantity: 0, unit, mealCount: 0, aisle: aisleOf(name), staple: isStaple(name), usedIn: [], meals: new Map<string, UsedIn>() };
        item.quantity += quantity;
        if (!item.meals.has(meal.mealId)) item.meals.set(meal.mealId, { mealId: meal.mealId, recipe: meal.recipe ?? "", date: meal.date ?? "" });
        map.set(key, item);
      }
    }
  }

  return [...map.values()]
    .map(({ meals: m, ...item }) => ({ ...item, quantity: round2(item.quantity), mealCount: m.size, usedIn: [...m.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
