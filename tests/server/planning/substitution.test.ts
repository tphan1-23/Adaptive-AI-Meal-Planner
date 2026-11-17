import { describe, expect, it } from "vitest";
import { describeSubstitute, findSubstitutes, violatesDiet, type SubstituteCandidate } from "@/server/planning/substitution";

let n = 0;
const ing = (name: string, category: string | null, calories: number, proteinG: number, carbsG: number, fatG: number): SubstituteCandidate => ({
  id: `i${n++}`, name, category, calories, proteinG, carbsG, fatG,
});

// In the USDA table `protein` means animal foods; tofu and tempeh are `legume`.
const chicken = ing("chicken breast", "protein", 120, 23, 0, 2.6);
const thigh = ing("chicken thigh", "protein", 125, 22, 0, 3);
const turkey = ing("turkey breast", "protein", 135, 30, 0, 1);
const salmon = ing("salmon", "protein", 208, 20, 0, 13);
const shrimp = ing("shrimp", "protein", 99, 24, 0.2, 0.3);
const soyBites = ing("soy chicken bites", "protein", 130, 24, 1, 2);
const tofu = ing("firm tofu", "legume", 144, 17, 3, 9);
const tempeh = ing("tempeh", "legume", 192, 20, 8, 11);
const cheddar = ing("cheddar cheese", "dairy", 403, 25, 1, 33);
const rice = ing("white rice", "grain", 360, 7, 79, 0.7);
const all = [chicken, thigh, turkey, salmon, shrimp, soyBites, cheddar, rice];

describe("findSubstitutes", () => {
  it("stays in the same category and never returns the original", () => {
    const out = findSubstitutes(chicken, all, { allergies: [] }, 100);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.category === "protein")).toBe(true);
    expect(out.map((s) => s.name)).not.toContain("chicken breast");
  });
  it("orders by nutritional closeness", () => {
    const out = findSubstitutes(chicken, all, { allergies: [], limit: 10 });
    expect(out[0].name).toBe("chicken thigh");
    const d = out.map((s) => s.distance);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
  it("excludes allergens, even when entered as another name", () => {
    const out = findSubstitutes(chicken, all, { allergies: ["Seafood", "soy"], limit: 10 });
    const names = out.map((s) => s.name);
    expect(names).not.toContain("shrimp");
    expect(names).not.toContain("soy chicken bites");
    expect(names).toContain("turkey breast");
  });
  it("scales the amount to keep calories the same", () => {
    const [s] = findSubstitutes(chicken, [turkey], { allergies: [], limit: 1 }, 200);
    expect(s.grams).toBe(178); // 240 kcal wanted / 135 kcal per 100 g
  });
  it("keeps amounts in a sensible range", () => {
    const sugar = ing("sugar", "sweetener", 399, 0, 100, 0);
    const honey = ing("honey", "sweetener", 304, 0.3, 82, 0);
    expect(findSubstitutes(sugar, [honey], { allergies: [] }, 400)[0].grams).toBe(400); // would be 525 g
  });
  it("drops swaps that are too different and labels the rest close or rough", () => {
    const butter = ing("butter", "dairy", 717, 1, 0, 81);
    const brie = ing("brie cheese", "dairy", 334, 21, 0, 28);
    expect(findSubstitutes(butter, [brie], { allergies: [] })).toEqual([]);
    expect(findSubstitutes(chicken, [thigh], { allergies: [] })[0].quality).toBe("close");
    expect(findSubstitutes(tofu, [tempeh], { allergies: [] })[0].quality).toBe("rough");
  });
  it("returns nothing when no candidate qualifies", () => {
    expect(findSubstitutes(rice, [cheddar], { allergies: [] })).toEqual([]);
  });
  it("is limited to the requested count", () => {
    expect(findSubstitutes(chicken, all, { allergies: [], limit: 2 })).toHaveLength(2);
  });
});

describe("diets", () => {
  const egg = ing("egg", "protein", 143, 12.6, 0.7, 9.5);
  const duckEgg = ing("duck egg", "protein", 185, 13, 1.5, 13);
  const seaBass = ing("sea bass", "protein", 124, 24, 0, 2.6);
  const squid = ing("squid", "protein", 92, 16, 3, 1.4);
  const pool = [seaBass, squid, duckEgg];

  it("vegetarians get eggs but never fish, even with unfamiliar names", () => {
    const names = findSubstitutes(egg, pool, { allergies: [], diet: "vegetarian", limit: 10 }).map((s) => s.name);
    expect(names).toEqual(["duck egg"]);
  });
  it("vegans get no animal foods at all", () => {
    expect(findSubstitutes(egg, pool, { allergies: [], diet: "vegan", limit: 10 })).toEqual([]);
    expect(findSubstitutes(tofu, [tempeh, ing("beef sausage", "legume", 190, 18, 6, 10)], { allergies: [], diet: "vegan" }).map((s) => s.name)).toEqual(["tempeh"]);
  });
  it("applies diets to dairy substitutes", () => {
    const mozzarella = ing("mozzarella", "dairy", 300, 22, 2, 22);
    expect(findSubstitutes(mozzarella, [cheddar], { allergies: [], diet: "vegan" })).toEqual([]);
    expect(findSubstitutes(mozzarella, [cheddar], { allergies: [], diet: "dairy-free" })).toEqual([]);
    expect(findSubstitutes(mozzarella, [cheddar], { allergies: [], diet: "vegetarian" })).toHaveLength(1);
  });
});

describe("violatesDiet", () => {
  it("flags meat, fish and the whole protein category for vegetarians", () => {
    expect(violatesDiet({ name: "beef liver", category: "protein" }, "vegetarian")).toBe(true);
    expect(violatesDiet({ name: "sea bass", category: "protein" }, "vegetarian")).toBe(true);
    expect(violatesDiet({ name: "egg", category: "protein" }, "vegetarian")).toBe(false);
    expect(violatesDiet({ name: "firm tofu", category: "legume" }, "vegetarian")).toBe(false);
  });
  it("flags dairy, egg and honey for vegans but not for vegetarians", () => {
    for (const [name, category] of [["cheddar cheese", "dairy"], ["egg", "protein"], ["honey", "sweetener"]]) {
      expect(violatesDiet({ name, category }, "vegan")).toBe(true);
    }
    expect(violatesDiet({ name: "honey", category: "sweetener" }, "vegetarian")).toBe(false);
  });
  it("applies gluten-free and dairy-free", () => {
    expect(violatesDiet({ name: "wheat flour", category: "grain" }, "gluten-free")).toBe(true);
    expect(violatesDiet({ name: "kefir", category: "dairy" }, "dairy-free")).toBe(true);
  });
  it("allows everything when there is no diet", () => {
    expect(violatesDiet({ name: "beef liver", category: "protein" }, null)).toBe(false);
  });
});

describe("describeSubstitute", () => {
  it("builds a plain sentence naming both foods and the amount", () => {
    const [s] = findSubstitutes(chicken, [turkey], { allergies: [], limit: 1 }, 200);
    const text = describeSubstitute(chicken, s, 200);
    expect(text).toContain("chicken breast");
    expect(text).toContain("turkey breast");
    expect(text).toContain("178 g");
    expect(text).toContain("more protein");
  });
});
