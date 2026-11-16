import { describe, it, expect } from "vitest";
import { aggregateIngredients, normalizeName, normalizeUnit } from "@/server/shopping-list/aggregate";

const item = (name: string, quantity = 1, unit = "item") => ({ name, quantity, unit });

describe("normalizeName", () => {
  it("lowercases and singularizes", () => {
    expect(normalizeName("Tomatoes")).toBe("tomato");
    expect(normalizeName("onions")).toBe("onion");
    expect(normalizeName("berries")).toBe("berry");
  });
  it("drops descriptors and parentheticals", () => {
    expect(normalizeName("fresh chopped parsley (optional)")).toBe("parsley");
  });
  it("leaves words like molasses alone", () => {
    expect(normalizeName("molasses")).toBe("molasses");
  });
});

describe("normalizeUnit", () => {
  it("converts mass to grams and volume to ml", () => {
    expect(normalizeUnit("kg", 1)).toEqual({ quantity: 1000, unit: "g" });
    expect(normalizeUnit("cups", 2)).toEqual({ quantity: 473.2, unit: "ml" });
  });
  it("treats blanks as items and keeps other units", () => {
    expect(normalizeUnit("", 3)).toEqual({ quantity: 3, unit: "item" });
    expect(normalizeUnit("cloves", 2)).toEqual({ quantity: 2, unit: "clove" });
  });
});

describe("aggregateIngredients", () => {
  it("merges duplicates across meals and counts meals", () => {
    const out = aggregateIngredients([
      { mealId: "a", ingredients: [item("garlic"), item("Onions"), item("olive oil")] },
      { mealId: "b", ingredients: [item("garlic"), item("onion")] },
      { mealId: "c", ingredients: [item("Garlic")] },
    ]);
    expect(out.find((i) => i.name === "garlic")).toMatchObject({ quantity: 3, mealCount: 3 });
    expect(out.find((i) => i.name === "onion")).toMatchObject({ quantity: 2, mealCount: 2 });
    expect(out.find((i) => i.name === "olive oil")).toMatchObject({ quantity: 1, mealCount: 1 });
  });
  it("sums real quantities in a common unit", () => {
    const out = aggregateIngredients([
      { mealId: "a", ingredients: [item("flour", 500, "g")] },
      { mealId: "b", ingredients: [item("flour", 1, "kg")] },
    ]);
    expect(out).toEqual([{ name: "flour", quantity: 1500, unit: "g", mealCount: 2 }]);
  });
  it("does not add different unit families together", () => {
    const out = aggregateIngredients([
      { mealId: "a", ingredients: [item("milk", 1, "cup")] },
      { mealId: "b", ingredients: [item("milk")] },
    ]);
    expect(out).toHaveLength(2);
  });
  it("counts a recipe planned twice as two meals", () => {
    const out = aggregateIngredients([
      { mealId: "mon", ingredients: [item("rice")] },
      { mealId: "thu", ingredients: [item("rice")] },
    ]);
    expect(out[0]).toMatchObject({ quantity: 2, mealCount: 2 });
  });
  it("skips bad lines and sorts by name", () => {
    const out = aggregateIngredients([
      { mealId: "a", ingredients: [item("zucchini"), item("apple"), { name: "", quantity: 1, unit: "item" }, item("bad", 0)] },
    ]);
    expect(out.map((i) => i.name)).toEqual(["apple", "zucchini"]);
  });
});
