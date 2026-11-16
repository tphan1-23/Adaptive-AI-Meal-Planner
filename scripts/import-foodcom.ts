// One-time import of a Food.com recipe subset into the Recipe table.
//
//   npx tsx scripts/import-foodcom.ts --dry-run   # counts only, no database writes
//   npx tsx scripts/import-foodcom.ts             # import for real (idempotent)
//
// Needs data/RAW_recipes.csv (gitignored). Safe to re-run: rows are keyed on sourceId.

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { PrismaClient } from "@prisma/client";
import {
  EXCLUDED_TAGS,
  cleanName,
  cleanStep,
  detectAllergens,
  detectCuisines,
  detectDiets,
  detectEquipment,
  parseNutrition,
  parsePyList,
} from "../src/server/db/foodcom-parse";

const FILE = path.join(process.cwd(), "data", "RAW_recipes.csv");
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH = 500;

// Max recipes to take per cuisine. Rare cuisines first, so they are never crowded out.
const QUOTAS: [string, number][] = [
  ["dominican", Infinity],
  ["kazakh", Infinity],
  ["vietnamese", Infinity],
  ["russian", Infinity],
  ["cuban", Infinity],
  ["filipino", Infinity],
  ["indonesian", Infinity],
  ["malaysian", Infinity],
  ["korean", Infinity],
  ["japanese", Infinity],
  ["thai", Infinity],
  ["french", Infinity],
  ["caribbean", 800],
  ["chinese", 1500],
  ["indian", 1500],
  ["mexican", 1500],
  ["italian", 2500],
  ["american", 2500],
  ["greek", 800],
  ["spanish", 600],
  ["middle-eastern", 800],
  ["german", 500],
  ["asian", 3000], // generic "asian" fill-in on top of the specific ones above
];

interface Raw {
  name: string; id: string; minutes: string; tags: string; nutrition: string;
  steps: string; ingredients: string;
}

interface Candidate { id: string; cuisines: string[] }

// Deterministic pseudo-random order so re-runs pick the same subset.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function* rows(): AsyncGenerator<Raw> {
  const parser = fs
    .createReadStream(FILE)
    .pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true, relax_column_count: true }));
  for await (const r of parser) yield r as Raw;
}

/** Returns a cleaned recipe row, or null if the row is not usable for a meal planner. */
function build(r: Raw) {
  const tags = parsePyList(r.tags);
  if (tags.some((t) => EXCLUDED_TAGS.has(t))) return null;
  const nutrition = parseNutrition(r.nutrition);
  if (!nutrition || nutrition.calories < 50 || nutrition.calories > 2500) return null;
  const steps = parsePyList(r.steps).map(cleanStep).filter(Boolean);
  const ingredientNames = parsePyList(r.ingredients).map((s) => s.trim()).filter(Boolean);
  const name = cleanName(r.name ?? "");
  const minutes = Number(r.minutes);
  if (!name || steps.length < 2 || ingredientNames.length < 3) return null;
  if (!Number.isFinite(minutes) || minutes > 600) return null;

  const cuisines = detectCuisines(name, tags);
  const diets = detectDiets(tags);
  return {
    cuisines,
    row: {
      sourceId: r.id,
      source: "dataset",
      name,
      calories: nutrition.calories,
      proteinG: nutrition.proteinG,
      carbsG: nutrition.carbsG,
      fatG: nutrition.fatG,
      // Food.com has names only (no quantities), so quantity/unit are placeholders.
      ingredients: ingredientNames.map((n) => ({ name: n, quantity: 1, unit: "item" })),
      steps,
      tags: [...new Set([...cuisines, ...tags])].slice(0, 30),
      equipment: detectEquipment(steps),
      allergens: detectAllergens(ingredientNames),
      diets,
    },
  };
}

async function main() {
  if (!fs.existsSync(FILE)) throw new Error(`Missing ${FILE}. Put RAW_recipes.csv in data/.`);

  // Pass 1: classify every row, collect candidates per cuisine.
  console.log("Pass 1: scanning...");
  const byCuisine = new Map<string, Candidate[]>();
  let total = 0, usable = 0;
  for await (const r of rows()) {
    total++;
    const b = build(r);
    if (!b) continue;
    usable++;
    for (const c of b.cuisines) {
      if (!byCuisine.has(c)) byCuisine.set(c, []);
      byCuisine.get(c)!.push({ id: r.id, cuisines: b.cuisines });
    }
  }
  console.log(`  ${total} rows read, ${usable} usable meals`);

  // Select: per cuisine in priority order, up to its quota, skipping already-chosen ids.
  const selected = new Set<string>();
  const perCuisine: Record<string, number> = {};
  for (const [cuisine, quota] of QUOTAS) {
    const pool = (byCuisine.get(cuisine) ?? []).slice().sort((a, b) => hash(a.id) - hash(b.id));
    let added = 0;
    for (const c of pool) {
      if (added >= quota) break;
      if (selected.has(c.id)) continue;
      selected.add(c.id);
      added++;
    }
    perCuisine[cuisine] = added;
  }
  console.log(`Selected ${selected.size} recipes. Newly added per cuisine (rarest first):`);
  for (const [c, n] of Object.entries(perCuisine)) console.log(`  ${c.padEnd(16)}${n}   (available: ${byCuisine.get(c)?.length ?? 0})`);

  if (DRY_RUN) {
    console.log("Dry run: nothing written.");
    return;
  }

  // Pass 2: build the selected rows and insert in batches.
  console.log("Pass 2: importing...");
  const prisma = new PrismaClient();
  let batch: ReturnType<typeof build>[] = [];
  let inserted = 0;
  const flush = async () => {
    if (!batch.length) return;
    const res = await prisma.recipe.createMany({ data: batch.map((b) => b!.row), skipDuplicates: true });
    inserted += res.count;
    batch = [];
    process.stdout.write(`\r  inserted ${inserted}`);
  };
  try {
    for await (const r of rows()) {
      if (!selected.has(r.id)) continue;
      const b = build(r);
      if (!b) continue;
      batch.push(b);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    console.log(`\nDone. ${inserted} new recipes inserted (existing ones were skipped).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
