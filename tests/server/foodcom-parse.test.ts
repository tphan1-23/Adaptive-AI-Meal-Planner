import { describe, it, expect } from "vitest";
import {
  parsePyList,
  parseNutrition,
  detectAllergens,
  detectDiets,
  detectEquipment,
  detectCuisines,
  cleanName,
} from "@/server/db/foodcom-parse";

describe("parsePyList", () => {
  it("parses single-quoted items", () => {
    expect(parsePyList("['a', 'b c']")).toEqual(["a", "b c"]);
  });
  it("keeps apostrophes inside double-quoted items", () => {
    expect(parsePyList(`["don't burn it", 'ok']`)).toEqual(["don't burn it", "ok"]);
  });
  it("returns [] for empty input", () => {
    expect(parsePyList("[]")).toEqual([]);
  });
});

describe("parseNutrition", () => {
  it("converts %DV to grams", () => {
    expect(parseNutrition("[200.0, 10.0, 5.0, 3.0, 20.0, 1.0, 10.0]")).toEqual({
      calories: 200, fatG: 7.8, proteinG: 10, carbsG: 27.5,
    });
  });
  it("returns null for bad data", () => {
    expect(parseNutrition("[1, 2]")).toBeNull();
  });
});

describe("detectAllergens", () => {
  it("finds common allergens", () => {
    const a = detectAllergens(["shrimp", "eggs", "all-purpose flour", "peanut oil"]);
    expect(a).toEqual(expect.arrayContaining(["shellfish", "egg", "gluten", "peanut"]));
  });
  it("does not flag eggplant as egg", () => {
    expect(detectAllergens(["eggplant"])).not.toContain("egg");
  });
  it("does not flag peanut butter as dairy", () => {
    const a = detectAllergens(["peanut butter"]);
    expect(a).toContain("peanut");
    expect(a).not.toContain("dairy");
  });
  it("treats rice noodles as gluten-free", () => {
    expect(detectAllergens(["rice noodles", "fish sauce"])).not.toContain("gluten");
  });
});

describe("detectDiets / equipment / cuisines", () => {
  it("vegan implies vegetarian and dairy-free", () => {
    expect(detectDiets(["vegan"])).toEqual(expect.arrayContaining(["vegan", "vegetarian", "dairy-free"]));
  });
  it("detects equipment from steps", () => {
    expect(detectEquipment(["Preheat oven to 350", "Blend until smooth"])).toEqual(
      expect.arrayContaining(["oven", "blender"]),
    );
  });
  it("maps tags and name keywords to cuisines", () => {
    expect(detectCuisines("Pho Bo", ["vietnamese"])).toEqual(expect.arrayContaining(["vietnamese", "asian"]));
    expect(detectCuisines("Sancocho Dominicano", [])).toContain("dominican");
    expect(detectCuisines("Beshbarmak", [])).toContain("kazakh");
    expect(detectCuisines("Chili", ["southern-united-states"])).toContain("american");
  });
  it("cleans names", () => {
    expect(cleanName("arriba   baked winter squash")).toBe("Arriba Baked Winter Squash");
  });
});
