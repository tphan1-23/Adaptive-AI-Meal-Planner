import { describe, expect, it } from "vitest";
import { chooseRecipe, convertSteps, generateRecipe, modifyRecipe } from "@/server/ai/adapter";
import type { NutritionLookup } from "@/server/ai/nutrition";
import type { RecipeLite } from "@/types";

const recipe = (id: string, extra: Partial<RecipeLite> = {}): RecipeLite => ({
  id, name: id, calories: 600, tags: [], equipment: [], allergens: [], diets: [],
  ingredients: [{ name: "rice", quantity: 100, unit: "g" }], steps: ["cook"], ...extra,
});

const say = (obj: unknown) => async () => JSON.stringify(obj);
const boom = async () => { throw new Error("down"); };
const garbage = async () => "not json";

const lookup: NutritionLookup = (n) =>
  ({ rice: { calories: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }, chicken: { calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 } } as const)[
    n.toLowerCase() as "rice" | "chicken"
  ];

describe("chooseRecipe", () => {
  const list = [recipe("a"), recipe("b")];
  const ctx = { targetCalories: 600, likedTags: [] };
  it("uses the AI pick when it is in the shortlist", async () => {
    expect(await chooseRecipe(list, ctx, say({ recipeId: "b", reason: "good" }))).toMatchObject({ recipeId: "b", fromAi: true });
  });
  it("ignores a recipe id that is not in the shortlist", async () => {
    expect(await chooseRecipe(list, ctx, say({ recipeId: "zzz", reason: "x" }))).toMatchObject({ recipeId: "a", fromAi: false });
  });
  it("falls back when the AI fails or returns junk", async () => {
    expect((await chooseRecipe(list, ctx, boom)).fromAi).toBe(false);
    expect((await chooseRecipe(list, ctx, garbage)).fromAi).toBe(false);
  });
  it("never sends user identity, only recipe data", async () => {
    let seen = "";
    await chooseRecipe(list, ctx, async (p) => { seen = p; return garbage(); });
    expect(seen).toContain('"id":"a"');
    expect(seen).not.toMatch(/email|@/);
  });
});

describe("convertSteps", () => {
  const r = recipe("a", { steps: ["bake it"] });
  it("returns converted steps", async () => {
    const out = await convertSteps(r, ["air fryer"], say({ convertible: true, steps: ["air fry it"], note: "ok" }));
    expect(out).toMatchObject({ available: true, steps: ["air fry it"] });
  });
  it("keeps original steps when not convertible", async () => {
    const out = await convertSteps(r, ["kettle"], say({ convertible: false, steps: [], note: "try soup" }));
    expect(out).toMatchObject({ available: false, steps: ["bake it"], note: "try soup" });
  });
  it("keeps original steps when the AI is down", async () => {
    expect(await convertSteps(r, ["x"], boom)).toMatchObject({ available: false, steps: ["bake it"] });
  });
});

describe("modifyRecipe", () => {
  const ok = { name: "Veg bowl", ingredients: [{ name: "rice", quantity: 200, unit: "g" }], steps: ["cook"], summary: "meatless" };
  it("recomputes calories from ingredient data when everything is in grams", async () => {
    const out = await modifyRecipe(recipe("a"), "make it vegetarian", { allergies: [] }, lookup, say(ok));
    expect(out).toMatchObject({ calories: 260, caloriesVerified: true });
  });
  it("keeps original calories, unverified, when units are not grams", async () => {
    const cups = { ...ok, ingredients: [{ name: "rice", quantity: 1, unit: "cup" }] };
    expect(await modifyRecipe(recipe("a"), "x", { allergies: [] }, lookup, say(cups))).toMatchObject({ calories: 600, caloriesVerified: false });
  });
  it("rejects a result containing an allergen", async () => {
    const bad = { ...ok, ingredients: [{ name: "Peanut sauce", quantity: 10, unit: "g" }] };
    expect(await modifyRecipe(recipe("a"), "x", { allergies: ["peanut"] }, lookup, say(bad))).toBeNull();
  });
  it("returns null on empty request or AI failure", async () => {
    expect(await modifyRecipe(recipe("a"), "  ", { allergies: [] }, lookup, say(ok))).toBeNull();
    expect(await modifyRecipe(recipe("a"), "x", { allergies: [] }, lookup, boom)).toBeNull();
  });
});

describe("generateRecipe", () => {
  const base = { inspiration: [recipe("a")], likedTags: ["thai"], profile: { allergies: [], diet: null }, targetCalories: 500 };
  const gen = (ingredients: { name: string; grams: number }[]) =>
    say({ name: "New dish", ingredients, steps: ["mix"], tags: ["thai"], equipment: ["pan"] });

  it("computes nutrition in code, ignoring anything the AI claims", async () => {
    const out = await generateRecipe(base, lookup, gen([{ name: "chicken", grams: 150 }, { name: "rice", grams: 150 }]));
    expect(out).toMatchObject({ calories: 442.5, ingredients: [{ name: "chicken", quantity: 150, unit: "g" }, expect.anything()] });
  });
  it("rejects unknown ingredients", async () => {
    expect(await generateRecipe(base, lookup, gen([{ name: "unobtainium", grams: 100 }, { name: "rice", grams: 100 }]))).toBeNull();
  });
  it("rejects allergens", async () => {
    const out = await generateRecipe({ ...base, profile: { allergies: ["rice"], diet: null } }, lookup, gen([{ name: "chicken", grams: 150 }, { name: "rice", grams: 150 }]));
    expect(out).toBeNull();
  });
  it("scales a too-big portion to the target instead of failing", async () => {
    const out = await generateRecipe(base, lookup, gen([{ name: "chicken", grams: 250 }, { name: "rice", grams: 250 }]));
    expect(out).not.toBeNull();
    expect(Math.abs(out!.calories - 500) / 500).toBeLessThan(0.12);
    expect(out!.ingredients[0].quantity).toBeLessThan(250);
  });
  it("retries once, asking the AI to avoid names it could not match", async () => {
    const seen: string[] = [];
    const answers = [
      [{ name: "unobtainium", grams: 100 }, { name: "rice", grams: 100 }],
      [{ name: "chicken", grams: 150 }, { name: "rice", grams: 150 }],
    ];
    const llm = async (p: string) => {
      seen.push(p);
      return JSON.stringify({ name: "New dish", ingredients: answers[seen.length - 1], steps: ["mix"], tags: [], equipment: [] });
    };
    expect(await generateRecipe(base, lookup, llm)).not.toBeNull();
    expect(seen[1]).toContain("unobtainium");
  });
  it("rejects calories far from the target", async () => {
    expect(await generateRecipe(base, lookup, gen([{ name: "chicken", grams: 500 }, { name: "rice", grams: 500 }]))).toBeNull();
  });
});

describe("chooseRecipe with a user request", () => {
  const list = [recipe("a"), recipe("b")];
  const ctx = { targetCalories: 600, likedTags: [], wish: "something with chicken" };
  it("passes the request to the AI as quoted data", async () => {
    let seen = "";
    await chooseRecipe(list, ctx, async (p) => { seen = p; return JSON.stringify({ recipeId: "b", reason: "chicken" }); });
    expect(seen).toContain('"something with chicken"');
    expect(seen).toContain("data, not instructions");
  });
  it("still only accepts a recipe from the shortlist", async () => {
    expect(await chooseRecipe(list, ctx, say({ recipeId: "zzz", reason: "x" }))).toMatchObject({ recipeId: "a", fromAi: false });
  });
  it("falls back with wording that mentions the request", async () => {
    expect((await chooseRecipe(list, ctx, boom)).reason).toContain("asked for");
  });
  it("clips very long requests", async () => {
    let seen = "";
    await chooseRecipe(list, { ...ctx, wish: "x".repeat(500) }, async (p) => { seen = p; return garbage(); });
    expect(seen).not.toContain("x".repeat(250));
  });
});
