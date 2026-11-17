import { prisma } from "../db/prisma";
import { buildIngredientMatcher, buildNutritionLookup, type IngredientRow, type NutritionLookup } from "./nutrition";

const TTL_MS = 10 * 60_000;

export interface IngredientRecord extends IngredientRow {
  id: string;
  category: string | null;
}

export interface IngredientIndex {
  rows: IngredientRecord[];
  /** Finds the Ingredient row for a recipe's wording ("ground cumin" -> "cumin seed"). */
  find: (name: string) => IngredientRecord | undefined;
  /** How many recipe ingredient lines resolve to each Ingredient id. High = a food people really cook with. */
  popularity: Map<string, number>;
}

interface Loaded {
  at: number;
  index: IngredientIndex;
  lookup: NutritionLookup;
}

let cached: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

async function build(): Promise<Loaded> {
  const rows: IngredientRecord[] = await prisma.ingredient.findMany({
    select: { id: true, name: true, category: true, calories: true, proteinG: true, carbsG: true, fatG: true },
  });
  const find = buildIngredientMatcher(rows);
  // Popularity must not credit one arbitrary row for a generic word like "oil".
  const strict = buildIngredientMatcher(rows, { allowContaining: false });

  // Count how often each distinct ingredient wording appears in the shared recipes.
  const counts = await prisma.$queryRaw<{ name: string | null; n: number }[]>`
    select e->>'name' as name, count(*)::int as n
    from "Recipe", jsonb_array_elements(ingredients) as e
    where "ownerId" is null and jsonb_typeof(ingredients) = 'array'
    group by 1`;
  const popularity = new Map<string, number>();
  for (const { name, n } of counts) {
    const row = name ? strict(name) : undefined;
    if (row) popularity.set(row.id, (popularity.get(row.id) ?? 0) + n);
  }

  return { at: Date.now(), index: { rows, find, popularity }, lookup: buildNutritionLookup(rows) };
}

async function load(): Promise<Loaded> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  // Share one load between concurrent requests.
  loading ??= build().finally(() => {
    loading = null;
  });
  const fresh = await loading;
  cached = fresh;
  return fresh;
}

/** The ingredient lookup, built from the Ingredient table and reused for 10 minutes. */
export async function getNutritionLookup(): Promise<NutritionLookup> {
  return (await load()).lookup;
}

/** The full ingredient index with popularity counts, reused for 10 minutes. */
export async function getIngredientIndex(): Promise<IngredientIndex> {
  return (await load()).index;
}
