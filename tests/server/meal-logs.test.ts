import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mealLogInput, resolveRange } from "@/server/adherence/meal-logs";

const issues = (input: unknown) => {
  const r = mealLogInput.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
};

describe("mealLogInput", () => {
  it("accepts a planned meal eaten as planned or skipped with just the entry", () => {
    expect(issues({ status: "eaten_as_planned", entryId: "e1" })).toEqual([]);
    expect(issues({ status: "skipped", entryId: "e1", note: "not hungry" })).toEqual([]);
  });
  it("needs an entry for planned meals", () => {
    expect(issues({ status: "eaten_as_planned" })).toEqual(["entryId"]);
    expect(issues({ status: "skipped" })).toEqual(["entryId"]);
  });
  it("needs calories for a modified meal", () => {
    expect(issues({ status: "modified", entryId: "e1" })).toEqual(["calories"]);
    expect(issues({ status: "modified", entryId: "e1", calories: 650 })).toEqual([]);
  });
  it("needs calories for an ad hoc meal and no plan entry", () => {
    expect(issues({ status: "ad_hoc" })).toEqual(["calories"]);
    expect(issues({ status: "ad_hoc", calories: 300, entryId: "e1" })).toEqual(["entryId"]);
    expect(issues({ status: "ad_hoc", calories: 300, mealType: "snack" })).toEqual([]);
  });
  it("rejects values that make no sense", () => {
    expect(issues({ status: "ad_hoc", calories: -5 })).toContain("calories");
    expect(issues({ status: "ad_hoc", calories: 90000 })).toContain("calories");
    expect(issues({ status: "ad_hoc", calories: 300, proteinG: 9999 })).toContain("proteinG");
    expect(issues({ status: "ad_hoc", calories: 300, date: "2026-02-31" })).toContain("date");
    expect(issues({ status: "ad_hoc", calories: 300, mealType: "brunch" })).toContain("mealType");
    expect(issues({ status: "ate_it", entryId: "e1" })).toContain("status");
    expect(issues({ status: "ad_hoc", calories: 300, note: "x".repeat(301) })).toContain("note");
  });
});

describe("resolveRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("defaults to the last 4 weeks ending today", () => {
    expect(resolveRange()).toEqual({ from: "2026-10-24", to: "2026-11-20" });
  });
  it("never goes past today, so future planned meals are not counted as missed", () => {
    expect(resolveRange("2026-11-16", "2026-12-31")).toEqual({ from: "2026-11-16", to: "2026-11-20" });
  });
  it("keeps an end date in the past", () => {
    expect(resolveRange("2026-11-01", "2026-11-10")).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });
  it("rejects a backwards or too-long range", () => {
    expect(() => resolveRange("2026-11-19", "2026-11-10")).toThrow(/must not be after/);
    expect(() => resolveRange("2026-01-01", "2026-11-20")).toThrow(/at most 120 days/);
  });
});
