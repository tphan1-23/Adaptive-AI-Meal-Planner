import { describe, it, expect } from "vitest";
import {
  isGenericTag,
  meaningfulTags,
  signalStrength,
  applySignal,
  recomputeAffinity,
  topTags,
  MAX_AFFINITY,
} from "@/server/adherence/affinity";

describe("isGenericTag", () => {
  it("ignores catalogue tags like cuisine, preparation and course", () => {
    for (const t of ["cuisine", "preparation", "course", "time-to-make", "main-ingredient", "occasion", "dietary"]) {
      expect(isGenericTag(t)).toBe(true);
    }
  });
  it("ignores time, step and nutrition-flag patterns", () => {
    for (const t of ["30-minutes-or-less", "4-hours-or-less", "3-steps-or-less", "5-ingredients-or-less", "low-sodium", "low-carb", "high-in-something", "free-of-something"]) {
      expect(isGenericTag(t)).toBe(true);
    }
  });
  it("ignores diet flags and meal types", () => {
    for (const t of ["vegan", "gluten-free", "main-dish", "lunch"]) expect(isGenericTag(t)).toBe(true);
  });
  it("keeps real taste tags", () => {
    for (const t of ["italian", "vietnamese", "chicken", "spicy", "comfort-food", "soups-stews", "dominican"]) {
      expect(isGenericTag(t)).toBe(false);
    }
  });
  it("meaningfulTags filters and dedupes", () => {
    expect(meaningfulTags(["Italian", "italian", "cuisine", "course", "chicken"])).toEqual(["italian", "chicken"]);
  });
});

describe("signalStrength", () => {
  it("maps ratings 1..5 to -1..+1", () => {
    expect(signalStrength("rating", 1)).toBe(-1);
    expect(signalStrength("rating", 3)).toBe(0);
    expect(signalStrength("rating", 5)).toBe(1);
  });
  it("likes are positive, dislikes negative", () => {
    expect(signalStrength("favorite")).toBeGreaterThan(0);
    expect(signalStrength("swap_in")).toBeGreaterThan(0);
    expect(signalStrength("skip")).toBeLessThan(0);
    expect(signalStrength("swap_out")).toBeLessThan(0);
  });
});

describe("applySignal", () => {
  it("only touches meaningful tags", () => {
    const out = applySignal({}, ["italian", "cuisine", "course", "chicken"], "favorite");
    expect(Object.keys(out).sort()).toEqual(["chicken", "italian"]);
    expect(out.italian).toBeGreaterThan(0);
  });
  it("lowers scores on a skip", () => {
    expect(applySignal({ spicy: 0.2 }, ["spicy"], "skip").spicy).toBeLessThan(0.2);
  });
  it("a neutral 3-star rating changes nothing", () => {
    expect(applySignal({}, ["italian"], "rating", 3)).toEqual({});
  });
  it("never exceeds the clamp", () => {
    let scores: Record<string, number> = {};
    for (let i = 0; i < 100; i++) scores = { ...scores, ...applySignal(scores, ["thai"], "favorite") };
    expect(scores.thai).toBe(MAX_AFFINITY);
  });
});

describe("recomputeAffinity / topTags", () => {
  it("rebuilds scores from history", () => {
    const scores = recomputeAffinity([
      { type: "favorite", recipeTags: ["italian", "cuisine"] },
      { type: "favorite", recipeTags: ["italian", "pasta"] },
      { type: "skip", recipeTags: ["spicy"] },
    ]);
    expect(scores.cuisine).toBeUndefined();
    expect(scores.italian).toBeGreaterThan(scores.pasta);
    expect(topTags(scores)).toEqual({ liked: ["italian", "pasta"], disliked: ["spicy"] });
  });
});
