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

describe("fallbacks beyond word dropping", () => {
  const rows = [
    row("cumin seed", 375), row("all-purpose flour", 364), row("bread flour", 361), row("rice flour", 363),
    row("vegetable oil", 862), row("olive oil", 884), row("coriander cilantro leave", 23),
    row("ginger root", 80), row("onion", 40), row("white rice", 360), row("cooked white rice", 151),
    row("cottage cheese", 98), row("cream cheese", 340),
  ];
  const l = buildNutritionLookup(rows);
  it("matches a word that only appears inside longer names", () => {
    expect(l("ground cumin")?.calories).toBe(375);
    expect(l("cumin")?.calories).toBe(375);
  });
  it("resolves a generic word when the shortest matches agree on calories", () => {
    expect(l("flour")?.calories).toBe(364);
    expect(l("oil")?.calories).toBe(884);
  });
  it("reads plain flour as all-purpose flour", () => {
    expect(buildNutritionLookup([row("all-purpose flour", 364), row("peanut flour", 428), row("carob flour", 222)])("flour")?.calories).toBe(364);
  });
  it("does not guess when the matches disagree", () => {
    expect(l("cheese")).toBeUndefined();
  });
  it("skips cooked variants unless the recipe says cooked", () => {
    expect(l("rice")?.calories).toBeGreaterThan(300); // never the 151 kcal cooked row
    expect(l("cooked rice")?.calories).toBe(151);
  });
  it("knows common synonyms", () => {
    expect(l("fresh cilantro")?.calories).toBe(23);
    expect(l("gingerroot")?.calories).toBe(80);
    expect(l("scallions")?.calories).toBe(40);
  });
  it("reads halves and leaves as portion words", () => {
    const m = buildNutritionLookup([row("chicken breast", 120), row("bay leaf", 313)]);
    expect(m("boneless skinless chicken breast halves")?.calories).toBe(120);
    expect(m("bay leaves")?.calories).toBe(313);
  });
  it("uses fresh ginger, not the dried spice, for fresh ginger", () => {
    const m = buildNutritionLookup([row("ginger", 335), row("ginger root", 80)]);
    expect(m("fresh ginger")?.calories).toBe(80);
    expect(m("ground ginger")?.calories).toBe(335);
  });
  it("treats water as zero calories", () => {
    expect(l("cold water")?.calories).toBe(0);
  });
});
