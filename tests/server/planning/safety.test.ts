import { describe, expect, it } from "vitest";
import { ingredientNamesOf, modificationFits, namesBreakRules, recipeFits } from "@/server/planning/safety";

const recipe = (over: Partial<{ allergens: string[]; diets: string[]; ingredients: unknown }> = {}) => ({
  allergens: [], diets: [], ingredients: [{ name: "rice" }, { name: "broccoli" }], ...over,
});

describe("recipeFits", () => {
  it("accepts a plain recipe for a user with no rules", () => {
    expect(recipeFits(recipe(), { allergies: [], diet: null })).toBe(true);
  });
  it("rejects a recipe tagged with the user's allergen, however the allergy was typed", () => {
    expect(recipeFits(recipe({ allergens: ["dairy"] }), { allergies: ["Milk"] })).toBe(false);
  });
  it("rejects a recipe whose tags miss the allergen but whose ingredients have it", () => {
    const r = recipe({ allergens: [], ingredients: [{ name: "fontina" }, { name: "pasta" }] });
    expect(recipeFits(r, { allergies: ["dairy"] })).toBe(false);
  });
  it("rejects a recipe that is not tagged with the user's diet", () => {
    expect(recipeFits(recipe({ diets: ["vegetarian"] }), { allergies: [], diet: "vegan" })).toBe(false);
    expect(recipeFits(recipe({ diets: ["vegan", "vegetarian"] }), { allergies: [], diet: "vegan" })).toBe(true);
  });
  it("rejects a vegetarian-tagged recipe that contains bacon", () => {
    const r = recipe({ diets: ["vegetarian"], ingredients: [{ name: "bacon" }, { name: "onion" }] });
    expect(recipeFits(r, { allergies: [], diet: "vegetarian" })).toBe(false);
  });
  it("does not reject look-alikes", () => {
    const r = recipe({ diets: ["vegan"], ingredients: [{ name: "peanut butter" }, { name: "coconut cream" }, { name: "eggplant" }] });
    expect(recipeFits(r, { allergies: ["dairy", "egg"], diet: "vegan" })).toBe(true);
  });
  it("copes with missing or odd ingredient data", () => {
    expect(recipeFits(recipe({ ingredients: null }), { allergies: ["dairy"] })).toBe(true);
    expect(recipeFits(recipe({ ingredients: [{}, null, 5] }), { allergies: ["dairy"] })).toBe(true);
  });
});

describe("modificationFits", () => {
  it("is fine when there is no modification", () => {
    expect(modificationFits(null, { allergies: ["dairy"] })).toBe(true);
  });
  it("rejects a modification that now contains the user's allergen", () => {
    const modified = { ingredients: [{ name: "salmon", quantity: 100, unit: "g" }] };
    expect(modificationFits(modified, { allergies: ["fish"] })).toBe(false);
    expect(modificationFits(modified, { allergies: ["dairy"] })).toBe(true);
  });
});

describe("namesBreakRules and ingredientNamesOf", () => {
  it("combines allergens and diet", () => {
    expect(namesBreakRules(["chicken breast"], { allergies: [], diet: "vegetarian" })).toBe(true);
    expect(namesBreakRules(["almond milk"], { allergies: ["dairy"], diet: "vegan" })).toBe(false);
    expect(namesBreakRules(["shrimp"], { allergies: ["shellfish"] })).toBe(true);
  });
  it("reads names out of JSON", () => {
    expect(ingredientNamesOf([{ name: "a" }, { name: "b" }])).toEqual(["a", "b"]);
    expect(ingredientNamesOf("nope")).toEqual([]);
  });
});
