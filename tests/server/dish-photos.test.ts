import { describe, expect, it } from "vitest";
import photos from "@/server/recipes/dish-photos.json";
import { DISH_RULES, dishTitle, photoFor } from "@/server/recipes/dish-photos";

describe("dishTitle", () => {
  it("matches real recipe names to a dish", () => {
    expect(dishTitle("Killer Lasagna")).toBe("Lasagne");
    expect(dishTitle("Butternut Squash Risotto With Spinach And Toasted Pine Nuts")).toBe("Risotto");
    expect(dishTitle("Baby Girl S Fried Rice")).toBe("Fried rice");
    expect(dishTitle("Healthified Easy No Yeast Thin Pizza Crust")).toBe("Pizza");
    expect(dishTitle("Spinach Feta Penne With Pine Nuts")).toBe("Pasta");
    expect(dishTitle("Thai Red Curry With Shrimp")).toBe("Curry");
  });
  it("prefers the specific dish over a general word", () => {
    expect(dishTitle("Chicken Noodle Soup")).toBe("Chicken soup");
    expect(dishTitle("Caesar Salad With Grilled Chicken")).toBe("Caesar salad");
    expect(dishTitle("Fettuccine Alfredo")).toBe("Fettuccine Alfredo");
  });
  it("returns null when nothing fits, and does not match inside other words", () => {
    expect(dishTitle("Grandma's Secret Dessert")).toBeNull();
    expect(dishTitle("Pistachio Cake")).toBeNull(); // not "pasta"
    expect(dishTitle("Phosphate Free Cake")).toBeNull(); // not "pho"
  });
});

describe("photoFor", () => {
  it("returns a Wikimedia photo address and its source page", () => {
    const p = photoFor("Killer Lasagna");
    expect(p?.url).toMatch(/^https:\/\/upload\.wikimedia\.org\/.+\.(jpe?g|png|webp)$/i);
    expect(p?.page).toMatch(/^https:\/\/en\.wikipedia\.org\//);
  });
  it("returns null for a recipe with no matching dish", () => {
    expect(photoFor("Grandma's Secret Dessert")).toBeNull();
  });
  it("has a photo for every dish the rules can return (rebuild with npm run build:dish-photos if this fails)", () => {
    const table = photos as Record<string, unknown>;
    const missing = [...new Set(DISH_RULES.map(([, t]) => t))].filter((t) => !table[t]);
    expect(missing).toEqual([]);
  });
});
