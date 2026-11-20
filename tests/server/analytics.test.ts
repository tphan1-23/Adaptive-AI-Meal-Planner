import { describe, expect, it } from "vitest";
import {
  adherenceVsWeight,
  dateRange,
  pearson,
  summarize,
  summarizeDays,
  summarizeWeeks,
  type LoggedMeal,
  type PlannedMeal,
} from "@/server/adherence/analytics";

const planned = (date: string, calories = 800): PlannedMeal => ({ date, calories });
const log = (date: string, status: LoggedMeal["status"], calories: number | null, planEntryId: string | null = "e"): LoggedMeal => ({
  date, status, calories, planEntryId,
});

describe("dateRange", () => {
  it("includes both ends and crosses month boundaries", () => {
    expect(dateRange("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  it("is empty when the end is before the start", () => {
    expect(dateRange("2026-11-02", "2026-11-01")).toEqual([]);
  });
});

describe("summarizeDays", () => {
  const days = summarizeDays(
    "2026-11-23", "2026-11-25",
    [planned("2026-11-23"), planned("2026-11-24", 700), planned("2026-11-25")],
    [log("2026-11-23", "eaten_as_planned", 800), log("2026-11-24", "skipped", 0), log("2026-11-24", "ad_hoc", 400, null)],
  );
  it("has one row per day, even with nothing on it", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    expect(days[2]).toMatchObject({ plannedMeals: 1, loggedPlannedMeals: 0, actualCalories: 0, loggedDays: 0 });
  });
  it("adds planned and actual calories per day", () => {
    expect(days[0]).toMatchObject({ plannedCalories: 800, actualCalories: 800, eatenAsPlanned: 1 });
    expect(days[1]).toMatchObject({ plannedCalories: 700, actualCalories: 400, skipped: 1, adHoc: 1 });
  });
  it("counts skipped meals as zero calories", () => {
    expect(days[1].actualCalories).toBe(400);
  });
  it("ignores things outside the range", () => {
    const out = summarizeDays("2026-11-23", "2026-11-23", [planned("2026-12-01")], [log("2026-10-01", "ad_hoc", 500, null)]);
    expect(out[0]).toMatchObject({ plannedMeals: 0, adHoc: 0, actualCalories: 0 });
  });
});

describe("summarize", () => {
  it("works out the rates over logged days only", () => {
    const days = summarizeDays(
      "2026-11-23", "2026-11-26",
      [planned("2026-11-23"), planned("2026-11-24"), planned("2026-11-25"), planned("2026-11-26")],
      [log("2026-11-23", "eaten_as_planned", 800), log("2026-11-24", "modified", 1000), log("2026-11-25", "skipped", 0)],
    );
    const s = summarize(days);
    expect(s).toMatchObject({ plannedMeals: 4, loggedPlannedMeals: 3, eatenAsPlanned: 1, modified: 1, skipped: 1 });
    expect(s.loggedShare).toBe(0.75);
    expect(s.followedRate).toBe(0.33);
    // 3 logged days, planned 2400 on them, actual 1800: 200 kcal a day under. The unlogged day is not counted.
    expect(s.calorieDifferencePerDay).toBe(-200);
  });
  it("returns nulls, not NaN, when nothing is planned or logged", () => {
    const s = summarize(summarizeDays("2026-11-23", "2026-11-24", [], []));
    expect(s.loggedShare).toBeNull();
    expect(s.followedRate).toBeNull();
    expect(s.calorieDifferencePerDay).toBeNull();
  });
  it("counts a day with only an ad hoc meal as logged", () => {
    const s = summarize(summarizeDays("2026-11-23", "2026-11-23", [], [log("2026-11-23", "ad_hoc", 600, null)]));
    expect(s.loggedDays).toBe(1);
    expect(s.calorieDifferencePerDay).toBe(600);
  });
});

describe("summarizeWeeks", () => {
  const from = "2026-11-16";
  const to = "2026-11-29";
  const days = summarizeDays(
    from, to,
    dateRange(from, to).map((d) => planned(d)),
    [log("2026-11-17", "eaten_as_planned", 800), log("2026-11-24", "skipped", 0)],
  );
  it("groups days into Monday-start weeks", () => {
    expect(summarizeWeeks(days, []).map((w) => w.weekStart)).toEqual(["2026-11-16", "2026-11-23"]);
  });
  it("averages weigh-ins per week and reports the change from the week before", () => {
    const weeks = summarizeWeeks(days, [
      { date: "2026-11-16", weightKg: 80 }, { date: "2026-11-20", weightKg: 79 },
      { date: "2026-11-24", weightKg: 78.5 },
    ]);
    expect(weeks[0]).toMatchObject({ avgWeightKg: 79.5, weightChangeKg: null });
    expect(weeks[1]).toMatchObject({ avgWeightKg: 78.5, weightChangeKg: -1 });
  });
  it("leaves the change empty when a week has no weigh-in", () => {
    const weeks = summarizeWeeks(days, [{ date: "2026-11-24", weightKg: 78 }]);
    expect(weeks[1]).toMatchObject({ avgWeightKg: 78, weightChangeKg: null });
    expect(weeks[0].avgWeightKg).toBeNull();
  });
});

describe("pearson", () => {
  it("is 1 for a perfect rise and -1 for a perfect fall", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1);
  });
  it("is null with fewer than 3 pairs or no spread", () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("adherenceVsWeight", () => {
  const week = (followedRate: number | null, weightChangeKg: number | null) => ({
    weekStart: "2026-11-16", plannedMeals: 7, loggedPlannedMeals: 7, eatenAsPlanned: 0, modified: 0, skipped: 0, adHoc: 0,
    plannedCalories: 0, actualCalories: 0, loggedDays: 7, plannedCaloriesOnLoggedDays: 0,
    loggedShare: 1, followedRate, calorieDifferencePerDay: 0, avgWeightKg: 80, weightChangeKg,
  });
  it("asks for more weeks when there is not enough data", () => {
    const out = adherenceVsWeight([week(0.9, -0.3), week(0.5, null), week(null, 0.1)]);
    expect(out.r).toBeNull();
    expect(out.weeks).toBe(1);
    expect(out.note).toMatch(/at least 3 weeks/);
  });
  it("finds the relationship once there are 3 weeks", () => {
    const out = adherenceVsWeight([week(0.9, -0.6), week(0.6, -0.2), week(0.3, 0.3), week(0.1, 0.6)]);
    expect(out.weeks).toBe(4);
    expect(out.r).toBeLessThan(-0.9); // following the plan more goes with losing more
    expect(out.note).toMatch(/not a cause/);
  });
});
