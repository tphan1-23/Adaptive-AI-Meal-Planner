import { describe, expect, it } from "vitest";
import { allergyKeywords, normalizeAllergies } from "@/server/planning/allergens";
import { filterRecipes, ingredientsHaveAllergen } from "@/server/planning/filter";
import { generatePlan } from "@/server/planning/generate-plan";
import { fitsMeal } from "@/server/planning/meal-types";
import type { RecipeLite } from "@/types";

const r = (id: string, calories: number, extra: Partial<RecipeLite> = {}): RecipeLite => ({
  id, name: id, calories, tags: [], equipment: [], allergens: [], diets: [], ...extra,
});

describe("allergy names", () => {
  it("maps common names onto the dataset's labels", () => {
    expect(normalizeAllergies(["Milk", "nuts", "Eggs", "shrimp", "peanut", "  "])).toEqual(
      ["dairy", "tree-nut", "egg", "shellfish", "peanut"],
    );
  });
  it("keeps unknown allergies as typed", () => {
    expect(normalizeAllergies(["Kiwi"])).toEqual(["kiwi"]);
  });
  it("filters recipes tagged with the canonical label when the user typed an alias", () => {
    const out = filterRecipes([r("a", 500, { allergens: ["dairy"] }), r("b", 500)], { allergies: ["milk"] });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });
  it("catches allergens by ingredient keyword in AI-written recipes", () => {
    expect(ingredientsHaveAllergen(["Slivered almonds"], ["nuts"])).toBe(true);
    expect(ingredientsHaveAllergen(["Greek yogurt"], ["milk"])).toBe(true);
    expect(ingredientsHaveAllergen(["rice", "chicken"], ["milk", "nuts"])).toBe(false);
  });
  it("includes the canonical label itself as a keyword", () => {
    expect(allergyKeywords(["shrimp"])).toContain("shellfish");
  });
});

describe("meal suitability", () => {
  it("treats main dishes as dinner and rejects side dishes", () => {
    expect(fitsMeal({ tags: ["main-dish"] }, "dinner")).toBe(true);
    expect(fitsMeal({ tags: ["side-dishes"] }, "dinner")).toBe(false);
    expect(fitsMeal({ tags: ["brunch"] }, "breakfast")).toBe(true);
  });
  it("plans a main dish over a closer-calorie side dish", () => {
    const recipes = [r("side", 800, { tags: ["side-dishes"] }), r("main", 700, { tags: ["main-dish"] })];
    const plan = generatePlan({ recipes, profile: { allergies: [], calorieTarget: 2000 }, startDate: "2026-11-23", days: 1 });
    expect(plan[0].recipeId).toBe("main");
  });
  it("falls back to every allowed recipe when none are tagged for the meal", () => {
    const plan = generatePlan({ recipes: [r("a", 800)], profile: { allergies: [], calorieTarget: 2000 }, startDate: "2026-11-23", days: 1 });
    expect(plan).toHaveLength(1);
  });
});

describe("variety", () => {
  const recipes = Array.from({ length: 60 }, (_, i) => r(`r${i}`, 800 + (i % 7), { tags: ["main-dish"] }));
  const base = { recipes, profile: { allergies: [], calorieTarget: 2000 }, startDate: "2026-11-23", days: 7 };
  const ids = (seed?: string) => generatePlan({ ...base, seed }).map((d) => d.recipeId);

  it("is repeatable for the same seed", () => {
    expect(ids("u1:2026-11-23")).toEqual(ids("u1:2026-11-23"));
  });
  it("changes with the seed and never repeats a recipe within the week", () => {
    expect(ids("u1:2026-11-23")).not.toEqual(ids("u1:2026-11-30"));
    expect(new Set(ids("u1:2026-11-23")).size).toBe(7);
  });
  it("skips excluded recipes", () => {
    const first = ids();
    const next = generatePlan({ ...base, excludeIds: new Set(first) }).map((d) => d.recipeId);
    expect(next.some((id) => first.includes(id))).toBe(false);
  });
});
