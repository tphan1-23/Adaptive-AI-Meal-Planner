import { describe, expect, it } from "vitest";
import { detectAllergens } from "@/server/planning/allergens";
import { addDays, isValidIsoDate, mondayOf } from "@/server/planning/week";
import { allowRequest, resetRateLimits } from "@/server/ai/rate-limit";

describe("weeks", () => {
  it("finds the Monday of any day in the week", () => {
    expect(mondayOf("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(mondayOf("2026-11-18")).toBe("2026-11-16"); // Wednesday
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
  });
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
  it("rejects dates that only look valid", () => {
    expect(isValidIsoDate("2026-11-16")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("11/16/2026")).toBe(false);
  });
});

describe("detectAllergens", () => {
  it("labels an AI recipe from its ingredient names", () => {
    expect(detectAllergens(["Greek yogurt", "slivered almonds", "rice"])).toEqual(["dairy", "tree-nut"]);
  });
  it("returns nothing for safe ingredients", () => {
    expect(detectAllergens(["rice", "chicken", "broccoli"])).toEqual([]);
  });
});

describe("rate limit", () => {
  it("allows up to the limit inside the window, then blocks, then recovers", () => {
    resetRateLimits();
    const t = 1_000_000;
    expect([1, 2, 3].map(() => allowRequest("u", 3, 60_000, t))).toEqual([true, true, true]);
    expect(allowRequest("u", 3, 60_000, t + 1000)).toBe(false);
    expect(allowRequest("u", 3, 60_000, t + 61_000)).toBe(true);
  });
  it("tracks users separately", () => {
    resetRateLimits();
    allowRequest("a", 1);
    expect(allowRequest("b", 1)).toBe(true);
  });
});
