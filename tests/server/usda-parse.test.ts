import { describe, it, expect } from "vitest";
import {
  categoryFor,
  ingredientName,
  isBrandOrJunk,
  isDried,
  isUsefulSweet,
  preferenceScore,
  preparationOf,
  simplifyName,
} from "@/server/db/usda-parse";

describe("simplifyName", () => {
  it("turns USDA descriptions into plain names", () => {
    expect(simplifyName("Oil, olive, salad or cooking")).toBe("olive oil");
    expect(simplifyName("Garlic, raw")).toBe("garlic");
    expect(simplifyName("Beef, ground, 85% lean meat / 15% fat, raw")).toBe("ground beef");
    expect(simplifyName("Chicken, broilers or fryers, breast, meat only, raw")).toBe("chicken breast");
    expect(simplifyName("Cheese, parmesan, grated")).toBe("parmesan cheese");
    expect(simplifyName("Sugars, brown")).toBe("brown sugar");
    expect(simplifyName("Spices, pepper, black")).toBe("black pepper");
    expect(simplifyName("Spices, cinnamon, ground")).toBe("cinnamon");
    expect(simplifyName("Wheat flour, white, all-purpose, enriched, bleached")).toBe("all-purpose flour");
  });
});

describe("ingredientName", () => {
  it("singularizes with the same rules as the shopping list", () => {
    expect(ingredientName("Onions, raw")).toBe("onion");
    expect(ingredientName("Carrots, raw")).toBe("carrot");
  });
  it("marks cooked versions so grams are not confused with raw", () => {
    expect(ingredientName("Rice, white, long-grain, regular, enriched, cooked")).toBe("cooked white rice");
  });
});

describe("preparation and preference", () => {
  it("detects raw versus cooked", () => {
    expect(preparationOf("Chicken, breast, raw")).toBe("raw");
    expect(preparationOf("Chicken, breast, roasted")).toBe("cooked");
    expect(preparationOf("Butter, salted")).toBe("other");
  });
  it("prefers raw over cooked, then shorter descriptions", () => {
    expect(preferenceScore("Beef, raw")).toBeLessThan(preferenceScore("Beef, cooked"));
    expect(preferenceScore("Beef, raw")).toBeLessThan(preferenceScore("Beef, ground, raw"));
  });
});

describe("plain names mean the fresh food, not the dried one", () => {
  it("keeps egg parts apart so plain egg is a whole egg", () => {
    expect(simplifyName("Egg, whole, raw, fresh")).toBe("egg");
    expect(simplifyName("Egg, yolk, raw, fresh")).toBe("egg yolk");
    expect(simplifyName("Egg, white, raw, fresh")).toBe("egg white");
    expect(simplifyName("Egg, duck, whole, fresh, raw")).toBe("duck egg");
  });
  it("separates ginger root from ground ginger", () => {
    expect(simplifyName("Ginger root, raw")).toBe("ginger");
    expect(simplifyName("Spices, ginger, ground")).toBe("ground ginger");
  });
  it("detects dried forms but not spices", () => {
    expect(isDried("Milk, dry, whole, with added vitamin D")).toBe(true);
    expect(isDried("Egg, whole, dried")).toBe(true);
    expect(isDried("Onions, dehydrated flakes")).toBe(true);
    expect(isDried("Milk, whole, 3.25% milkfat")).toBe(false);
    expect(isDried("Spices, ginger, ground")).toBe(false);
  });
  it("ranks dried versions last for the same name", () => {
    expect(preferenceScore("Milk, whole, 3.25% milkfat, with added vitamin D")).toBeLessThan(
      preferenceScore("Milk, dry, whole, with added vitamin D"),
    );
    expect(preferenceScore("Egg, whole, raw, fresh")).toBeLessThan(preferenceScore("Egg, whole, dried"));
  });
  it("prefers meat-only chicken", () => {
    expect(preferenceScore("Chicken, broilers or fryers, breast, meat only, raw")).toBeLessThan(
      preferenceScore("Chicken, broilers or fryers, breast, meat and skin, raw"),
    );
  });
});

describe("filters", () => {
  it("keeps eggs as protein but not eggplant", () => {
    expect(categoryFor("Egg, whole, raw, fresh", "dairy")).toBe("protein");
    expect(categoryFor("Eggplant, raw", "vegetable")).toBe("vegetable");
  });
  it("drops brand-name rows", () => {
    expect(isBrandOrJunk("SILK Coffee, soymilk")).toBe(true);
    expect(isBrandOrJunk("Pillsbury Golden Layer Biscuits")).toBe(true);
    expect(isBrandOrJunk("Garlic, raw")).toBe(false);
  });
  it("only keeps everyday sweeteners from Sweets", () => {
    expect(isUsefulSweet("Honey")).toBe(true);
    expect(isUsefulSweet("Sugars, granulated")).toBe(true);
    expect(isUsefulSweet("Candies, milk chocolate")).toBe(false);
  });
});
