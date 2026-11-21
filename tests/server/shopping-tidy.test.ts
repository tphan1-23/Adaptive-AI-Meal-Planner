import { describe, expect, it } from "vitest";
import { aggregateIngredients } from "@/server/shopping-list/aggregate";
import { aisleOf, canonicalNames, isStaple } from "@/server/shopping-list/tidy";

const one = (s: string) => canonicalNames(s)[0];

describe("canonicalNames: the same product written different ways becomes one name", () => {
  it("drops portion words (clove, leaf, half, sprig...)", () => {
    expect(canonicalNames("garlic cloves")).toEqual(["garlic"]);
    expect(canonicalNames("garlic clove")).toEqual(["garlic"]);
    expect(canonicalNames("basil leaves")).toEqual(["basil"]);
    expect(canonicalNames("parsley leaves")).toEqual(["parsley"]);
    expect(canonicalNames("boneless skinless chicken breast halves")).toEqual(["chicken breast"]);
    expect(canonicalNames("chicken breast halves")).toEqual(["chicken breast"]);
  });
  it("drops quality and preparation words", () => {
    expect(one("lean ground beef")).toBe("ground beef");
    expect(one("extra virgin olive oil")).toBe("olive oil");
    expect(one("unsalted butter")).toBe("butter");
    expect(one("real butter")).toBe("butter");
    expect(one("Fresh chopped parsley (optional)")).toBe("parsley");
  });
  it("keeps 'ground' for meat and drops it for spices", () => {
    expect(one("ground beef")).toBe("ground beef");
    expect(one("ground turkey")).toBe("ground turkey");
    expect(one("ground cumin")).toBe("cumin");
    expect(one("ground black pepper")).toBe("black pepper");
  });
  it("merges salt and pepper spellings, and splits combined lines in two", () => {
    expect(one("kosher salt")).toBe("salt");
    expect(one("sea salt")).toBe("salt");
    expect(one("pepper")).toBe("black pepper");
    expect(canonicalNames("salt and pepper")).toEqual(["salt", "black pepper"]);
    expect(canonicalNames("salt and black pepper")).toEqual(["salt", "black pepper"]);
    expect(canonicalNames("salt freshly ground black pepper")).toEqual(["salt", "black pepper"]);
    expect(canonicalNames("kosher salt & pepper to taste")).toEqual(["salt", "black pepper"]);
  });
  it("fixes the plural forms the old code got wrong", () => {
    expect(one("green chilies")).toBe("green chili");
    expect(one("tomatoes")).toBe("tomato");
    expect(one("berries")).toBe("berry");
    expect(one("potatoes")).toBe("potato");
    expect(one("molasses")).toBe("molasses");
    expect(one("peaches")).toBe("peach");
  });
  it("merges obvious synonyms but keeps different products apart", () => {
    expect(one("vegetable oil")).toBe("cooking oil");
    expect(one("oil")).toBe("cooking oil");
    expect(one("yellow onion")).toBe("onion");
    expect(one("red onion")).toBe("red onion");
    expect(one("plum tomatoes")).toBe("tomato");
    expect(one("cherry tomatoes")).toBe("cherry tomato");
    expect(one("whole milk")).toBe("milk");
    expect(one("Parmesan")).toBe("parmesan cheese");
    expect(one("crushed red pepper flakes")).toBe("red pepper flakes");
    expect(one("red cayenne pepper")).toBe("cayenne pepper");
    expect(one("homemade chicken stock")).toBe("chicken broth");
    expect(one("lemon juice and zest of")).toBe("lemon");
    expect(one("dried basil")).toBe("dried basil"); // dried herbs are a different thing to buy
    expect(one("peanut oil")).toBe("peanut oil"); // an allergen, never merged into plain oil
    expect(one("half-and-half")).toBe("half-and-half");
    expect(one("sharp cheddar cheese")).toBe("cheddar cheese");
    expect(one("smoked cheddar cheese")).toBe("cheddar cheese");
    expect(one("Italian parsley")).toBe("parsley");
    expect(one("whipping cream")).toBe("heavy cream");
    expect(one("cold water")).toBe("water");
    expect(one("celery rib")).toBe("celery");
    expect(one("soft taco-size flour tortillas")).toBe("flour tortilla");  });
  it("returns nothing for an empty line", () => {
    expect(canonicalNames("")).toEqual([]);
    expect(canonicalNames("(optional)")).toEqual([]);
  });
});

describe("aisleOf and isStaple", () => {
  it("puts things in the right aisle", () => {
    expect(aisleOf("garlic")).toBe("produce");
    expect(aisleOf("red bell pepper")).toBe("produce");
    expect(aisleOf("green chili")).toBe("produce");
    expect(aisleOf("chicken breast")).toBe("meat");
    expect(aisleOf("ground beef")).toBe("meat");
    expect(aisleOf("salmon")).toBe("seafood");
    expect(aisleOf("milk")).toBe("dairy");
    expect(aisleOf("cheddar cheese")).toBe("dairy");
    expect(aisleOf("egg")).toBe("dairy");
    expect(aisleOf("flour tortilla")).toBe("bakery");
    expect(aisleOf("corn tortilla")).toBe("bakery");
    expect(aisleOf("frozen pea")).toBe("frozen");
    expect(aisleOf("cumin")).toBe("spices");
    expect(aisleOf("dried oregano")).toBe("spices");
    expect(aisleOf("chili powder")).toBe("spices");
    expect(aisleOf("black pepper")).toBe("spices");
  });
  it("keeps sauces, broths, oils and nuts in the pantry", () => {
    for (const n of ["chicken broth", "tomato sauce", "olive oil", "pine nut", "sun-dried tomato", "white wine", "penne pasta", "egg noodle", "peanut butter", "coconut milk"]) {
      expect(aisleOf(n)).toBe("pantry");
    }
  });
  it("marks only the true basics as staples", () => {
    for (const n of ["salt", "black pepper", "water", "cooking oil", "olive oil", "sugar", "flour"]) expect(isStaple(n)).toBe(true);
    for (const n of ["butter", "garlic", "cumin", "milk"]) expect(isStaple(n)).toBe(false);
  });
});

describe("aggregateIngredients with messy names", () => {
  const line = (name: string) => ({ name, quantity: 1, unit: "item" });
  it("collapses variants into one item and counts meals once", () => {
    const out = aggregateIngredients([
      { mealId: "a", recipe: "Lasagna", date: "2026-11-23", ingredients: [line("garlic"), line("garlic cloves"), line("salt and pepper"), line("basil leaves")] },
      { mealId: "b", recipe: "Chili", date: "2026-11-24", ingredients: [line("Garlic Clove"), line("kosher salt"), line("ground black pepper"), line("dried basil")] },
    ]);
    const get = (n: string) => out.find((i) => i.name === n)!;
    expect(get("garlic")).toMatchObject({ mealCount: 2, aisle: "produce", staple: false });
    expect(get("salt")).toMatchObject({ mealCount: 2, staple: true });
    expect(get("black pepper")).toMatchObject({ mealCount: 2, staple: true });
    expect(get("basil").mealCount).toBe(1);
    expect(get("dried basil").mealCount).toBe(1);
    expect(out.map((i) => i.name)).toEqual(["basil", "black pepper", "dried basil", "garlic", "salt"]);
  });
  it("says which meals need each item", () => {
    const out = aggregateIngredients([
      { mealId: "a", recipe: "Lasagna", date: "2026-11-23", ingredients: [line("onion")] },
      { mealId: "b", recipe: "Chili", date: "2026-11-24", ingredients: [line("yellow onion")] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].usedIn).toEqual([
      { mealId: "a", recipe: "Lasagna", date: "2026-11-23" },
      { mealId: "b", recipe: "Chili", date: "2026-11-24" },
    ]);
  });
});
