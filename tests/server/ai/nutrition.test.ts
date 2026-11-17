import { describe, expect, it } from "vitest";
import { buildNutritionLookup, computeNutrition, nameCandidates } from "@/server/ai/nutrition";

const row = (name: string, calories: number) => ({ name, calories, proteinG: 1, carbsG: 1, fatG: 1 });
const lookup = buildNutritionLookup([
  row("cumin", 375), row("garlic", 149), row("tomato", 18), row("olive oil", 884), row("butter", 717),
  row("chicken breast", 120), row("blueberry", 57),
]);

describe("nameCandidates", () => {
  it("tries the full name, then drops leading words, then trailing words", () => {
    expect(nameCandidates("Fresh ground cumin")).toEqual(["fresh ground cumin", "ground cumin", "cumin", "fresh ground", "fresh"]);
  });
  it("ignores punctuation and parentheses", () => {
    expect(nameCandidates("Garlic, minced (fresh)")).toEqual(["garlic minced", "minced", "garlic"]);
  });
});

describe("portion words", () => {
  const spiceAndGarlic = buildNutritionLookup([row("clove", 274), row("garlic", 149)]);
  it("garlic cloves is garlic, not the spice clove", () => {
    expect(spiceAndGarlic("garlic cloves")?.calories).toBe(149);
  });
  it("does not fall back to the spice when garlic is missing", () => {
    expect(buildNutritionLookup([row("clove", 274)])("garlic cloves")).toBeUndefined();
  });
  it("ground cloves is the spice", () => {
    expect(spiceAndGarlic("ground cloves")?.calories).toBe(274);
  });
});

describe("buildNutritionLookup", () => {
  it("matches exactly first", () => {
    expect(lookup("olive oil")?.calories).toBe(884);
  });
  it("drops leading words when there is no exact match", () => {
    expect(lookup("ground cumin")?.calories).toBe(375);
    expect(lookup("extra virgin olive oil")?.calories).toBe(884);
  });
  it("drops trailing words as a later fallback", () => {
    expect(lookup("garlic cloves")?.calories).toBe(149);
  });
  it("handles plurals and case", () => {
    expect(lookup("Tomatoes")?.calories).toBe(18);
    expect(lookup("BLUEBERRIES")?.calories).toBe(57);
  });
  it("prefers a longer match over a shorter one", () => {
    expect(lookup("skinless chicken breast")?.calories).toBe(120);
  });
  it("returns undefined when nothing matches", () => {
    expect(lookup("unobtainium")).toBeUndefined();
  });
  it("makes computeNutrition work with messy recipe names", () => {
    const n = computeNutrition([{ name: "ground cumin", grams: 10 }, { name: "garlic cloves", grams: 20 }], lookup);
    expect(n?.calories).toBe(67.3);
  });
});
