import { describe, expect, it } from "vitest";
import { filterRecipes } from "@/server/planning/filter";
import { rankRecipes } from "@/server/planning/rank";
import { generatePlan } from "@/server/planning/generate-plan";
import type { RecipeLite } from "@/types";

const r = (id: string, calories: number, extra: Partial<RecipeLite> = {}): RecipeLite => ({
  id, name: id, calories, tags: [], equipment: [], allergens: [], diets: [], ...extra,
});

describe("filterRecipes", () => {
  it("removes recipes with the user's allergens (case-insensitive)", () => {
    const out = filterRecipes([r("a", 500, { allergens: ["Peanut"] }), r("b", 500)], { allergies: ["peanut"] });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });
  it("keeps only recipes matching the diet", () => {
    const out = filterRecipes([r("a", 500, { diets: ["vegan"] }), r("b", 500)], { diet: "Vegan", allergies: [] });
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
  it("does not filter on equipment", () => {
    expect(filterRecipes([r("a", 500, { equipment: ["oven"] })], { allergies: [] })).toHaveLength(1);
  });
  it("honours excluded ids", () => {
    expect(filterRecipes([r("a", 500)], { allergies: [] }, new Set(["a"]))).toHaveLength(0);
  });
});

describe("rankRecipes", () => {
  it("orders by calorie closeness", () => {
    const out = rankRecipes([r("far", 900), r("near", 410)], { targetCalories: 400 });
    expect(out.map((x) => x.id)).toEqual(["near", "far"]);
  });
  it("affinity can lift a slightly worse calorie match", () => {
    const out = rankRecipes([r("a", 400), r("b", 440, { tags: ["thai"] })], {
      targetCalories: 400, affinity: { thai: 3 },
    });
    expect(out[0].id).toBe("b");
  });
});

describe("generatePlan", () => {
  const profile = { allergies: ["peanut"], calorieTarget: 2000 };
  const recipes = [r("a", 800), r("b", 780), r("c", 300, { allergens: ["peanut"] })];

  it("plans one recipe per day with consecutive dates and no allergens", () => {
    const plan = generatePlan({ recipes, profile, startDate: "2026-11-30", days: 2 });
    expect(plan.map((p) => p.date)).toEqual(["2026-11-30", "2026-12-01"]);
    expect(plan.map((p) => p.recipeId)).toEqual(["a", "b"]);
  });
  it("returns an empty plan when nothing passes the filters", () => {
    expect(generatePlan({ recipes: [recipes[2]], profile, startDate: "2026-11-30", days: 3 })).toEqual([]);
  });
});
