import { describe, expect, it } from "vitest";
import { dishKind } from "@/lib/dish-art";

describe("dishKind", () => {
  it("recognises dishes from real recipe names", () => {
    expect(dishKind("Killer Lasagna")).toBe("noodles");
    expect(dishKind("Open Sesame Noodles")).toBe("noodles");
    expect(dishKind("Voodoo Calamari Ink Pasta")).toBe("noodles");
    expect(dishKind("Tide Me Over Indian Chaat Simple Veggie Salad")).toBe("salad");
    expect(dishKind("Jamaican Me Hungry Chicken Bake")).toBe("protein");
    expect(dishKind("Red Lentil Curry")).toBe("soup");
  });
  it("lets the name win over tags", () => {
    expect(dishKind("Veggie Salad", ["chicken"])).toBe("salad");
  });
  it("falls back to tags, then to the bowl", () => {
    expect(dishKind("Grandma's Special", ["main-dish", "pasta"])).toBe("noodles");
    expect(dishKind("Some Like It Hot", ["asian"])).toBe("bowl");
  });
  it("does not match inside other words", () => {
    expect(dishKind("Pistachio Cake")).toBe("bowl"); // "pistachio" is not "pasta"
    expect(dishKind("Phosphate Free Cake")).toBe("bowl"); // not "pho"
  });
});
