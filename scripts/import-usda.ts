// One-time import of USDA FoodData Central (SR Legacy) ingredient nutrition into Ingredient.
//
//   npx tsx scripts/import-usda.ts --dry-run   # show what would be imported, no writes
//   npx tsx scripts/import-usda.ts             # import for real (idempotent)
//
// Needs the SR Legacy CSV download unzipped under data/usda/ (gitignored):
//   https://fdc.nal.usda.gov/download-datasets  ->  "SR Legacy" -> CSV
// Values are per 100 g. Safe to re-run: rows are keyed on fdcId.

import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { PrismaClient } from "@prisma/client";
import {
  CATEGORY_MAP, NUTRIENT, categoryFor, ingredientName, isBrandOrJunk, isDried, isUsefulSweet, preferenceScore,
} from "../src/server/db/usda-parse";

const DRY_RUN = process.argv.includes("--dry-run");

function findDir(): string {
  const root = path.join(process.cwd(), "data", "usda");
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    if (!fs.existsSync(d)) continue;
    if (fs.existsSync(path.join(d, "food_nutrient.csv"))) return d;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) stack.push(path.join(d, e.name));
  }
  throw new Error("Could not find food_nutrient.csv under data/usda/. Unzip the SR Legacy CSV download there.");
}

async function* rows(file: string): AsyncGenerator<Record<string, string>> {
  const parser = fs.createReadStream(file).pipe(parse({ columns: true, relax_quotes: true, skip_empty_lines: true }));
  for await (const r of parser) yield r as Record<string, string>;
}

interface Candidate {
  fdcId: number;
  name: string;
  category: string;
  description: string;
  nutrients: Partial<Record<"kcal" | "protein" | "fat" | "carbs", number>>;
}

async function main() {
  const dir = findDir();

  const categories = new Map<string, string>();
  for await (const r of rows(path.join(dir, "food_category.csv"))) categories.set(r.id, r.description);

  const foods = new Map<number, Candidate>();
  for await (const r of rows(path.join(dir, "food.csv"))) {
    const usdaCategory = categories.get(r.food_category_id) ?? "";
    const mapped = CATEGORY_MAP[usdaCategory];
    if (!mapped || isBrandOrJunk(r.description)) continue;
    if (usdaCategory === "Sweets" && !isUsefulSweet(r.description)) continue;
    const cat = categoryFor(r.description, mapped);
    const name = ingredientName(r.description);
    if (!name) continue;
    foods.set(Number(r.fdc_id), { fdcId: Number(r.fdc_id), name, category: cat, description: r.description, nutrients: {} });
  }

  const idToKey = new Map<number, keyof Candidate["nutrients"]>([
    [NUTRIENT.kcal, "kcal"], [NUTRIENT.protein, "protein"], [NUTRIENT.fat, "fat"], [NUTRIENT.carbs, "carbs"],
  ]);
  for await (const r of rows(path.join(dir, "food_nutrient.csv"))) {
    const key = idToKey.get(Number(r.nutrient_id));
    if (!key) continue;
    const f = foods.get(Number(r.fdc_id));
    if (f) f.nutrients[key] = Number(r.amount);
  }

  // Keep complete rows only.
  const complete: Candidate[] = [];
  let incomplete = 0;
  for (const f of foods.values()) {
    const n = f.nutrients;
    if (![n.kcal, n.protein, n.fat, n.carbs].every((v) => v !== undefined && Number.isFinite(v))) {
      incomplete++;
      continue;
    }
    complete.push(f);
  }

  // If a plain name has both a fresh and a dried version (milk vs dried milk), the dried one
  // gets an explicit "dried ..." name so it can never win the plain name with ~5x the calories.
  const hasFresh = new Set(complete.filter((f) => !isDried(f.description)).map((f) => f.name));
  for (const f of complete) if (isDried(f.description) && hasFresh.has(f.name)) f.name = `dried ${f.name}`;

  // One row per name (raw preferred, dried last, then the shortest description).
  const best = new Map<string, Candidate>();
  for (const f of complete) {
    const cur = best.get(f.name);
    if (!cur || preferenceScore(f.description) < preferenceScore(cur.description)) best.set(f.name, f);
  }
  const chosen = [...best.values()].sort((a, b) => a.name.localeCompare(b.name));

  const byCat: Record<string, number> = {};
  for (const c of chosen) byCat[c.category] = (byCat[c.category] ?? 0) + 1;
  console.log(`${foods.size} foods in imported categories, ${incomplete} skipped (missing nutrients)`);
  console.log(`${chosen.length} unique ingredients after de-duplicating by simplified name`);
  console.log("By category:", byCat);
  console.log("Sample:");
  for (const c of chosen.filter((_, i) => i % Math.ceil(chosen.length / 25) === 0))
    console.log(`  ${c.name.padEnd(32)} ${c.category.padEnd(10)} ${String(c.nutrients.kcal).padStart(5)} kcal   <- ${c.description.slice(0, 60)}`);

  const dump = process.argv.indexOf("--dump");
  if (dump > 0) fs.writeFileSync(process.argv[dump + 1], JSON.stringify(chosen.map((c) => ({ name: c.name, kcal: c.nutrients.kcal, description: c.description })), null, 1));

  if (DRY_RUN) {
    console.log("Dry run: nothing written.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    let written = 0;
    for (const c of chosen) {
      const data = {
        name: c.name,
        category: c.category,
        calories: c.nutrients.kcal!,
        proteinG: c.nutrients.protein!,
        carbsG: c.nutrients.carbs!,
        fatG: c.nutrients.fat!,
      };
      await prisma.ingredient.upsert({ where: { fdcId: c.fdcId }, create: { fdcId: c.fdcId, ...data }, update: data });
      written++;
      if (written % 200 === 0) process.stdout.write(`\r  upserted ${written}/${chosen.length}`);
    }
    // Remove rows an earlier run imported that the current rules no longer choose.
    const stale = await prisma.ingredient.deleteMany({
      where: { fdcId: { not: null, notIn: chosen.map((c) => c.fdcId) } },
    });
    console.log(`\nDone. ${written} ingredients written, ${stale.count} stale rows removed.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
