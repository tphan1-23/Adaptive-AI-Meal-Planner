import { describe, it, expect } from "vitest";
import { adjustTarget, weeklyTrend, expectedWeeklyChange, type WeightPoint } from "@/server/profile/weigh-in";
import { dailyTarget, goalDelta } from "@/server/profile/calories";

const DAY = 86_400_000;
const start = new Date("2026-01-01T12:00:00Z").getTime();

/** weights[i] is the weight i*stepDays days after the start. */
function logs(weights: number[], stepDays = 7): WeightPoint[] {
  return weights.map((w, i) => ({ weightKg: w, loggedAt: new Date(start + i * stepDays * DAY) }));
}

describe("weeklyTrend", () => {
  it("returns null with fewer than 2 logs or a too-short span", () => {
    expect(weeklyTrend(logs([80]))).toBeNull();
    expect(weeklyTrend(logs([80, 79.9], 2))).toBeNull();
  });
  it("measures kg per week", () => {
    expect(weeklyTrend(logs([80, 79.5, 79]))).toBeCloseTo(-0.5);
    expect(weeklyTrend(logs([80, 80, 80]))).toBeCloseTo(0);
  });
});

describe("expectedWeeklyChange", () => {
  it("is negative for lose, positive for gain, zero for maintain", () => {
    expect(expectedWeeklyChange("lose", 0.5)).toBe(-0.5);
    expect(expectedWeeklyChange("gain", 0.25)).toBe(0.25);
    expect(expectedWeeklyChange("maintain", 0.5)).toBe(0);
  });
});

describe("adjustTarget", () => {
  const base = { currentTarget: 2000, sex: "male" as const, goal: "lose" as const, goalRateKg: 0.5 };

  it("leaves the target alone when there is no trend yet", () => {
    const r = adjustTarget({ ...base, logs: logs([80]) });
    expect(r.changed).toBe(false);
    expect(r.newTarget).toBe(2000);
  });
  it("leaves the target alone when on track", () => {
    const r = adjustTarget({ ...base, logs: logs([80, 79.5, 79]) });
    expect(r.changed).toBe(false);
  });
  it("lowers calories when losing too slowly", () => {
    const r = adjustTarget({ ...base, logs: logs([80, 80, 80]) });
    expect(r.changed).toBe(true);
    expect(r.newTarget).toBe(1900);
  });
  it("raises calories when losing too fast", () => {
    const r = adjustTarget({ ...base, logs: logs([80, 78.5, 77]) });
    expect(r.newTarget).toBe(2100);
  });
  it("never goes below the safety floor", () => {
    const r = adjustTarget({ ...base, currentTarget: 1500, logs: logs([80, 80, 80]) });
    expect(r.newTarget).toBe(1500);
    expect(r.changed).toBe(false);
  });
  it("raises calories for a gain goal that is not gaining", () => {
    const r = adjustTarget({ ...base, goal: "gain", goalRateKg: 0.25, logs: logs([70, 70, 70]) });
    expect(r.newTarget).toBe(2100);
  });
});

describe("goalDelta with a weekly rate", () => {
  it("converts kg/week to kcal/day", () => {
    expect(goalDelta("lose", 0.5)).toBe(-550);
    expect(goalDelta("gain", 0.25)).toBe(275);
    expect(goalDelta("maintain", 0.5)).toBe(0);
  });
  it("caps the daily deficit", () => {
    expect(goalDelta("lose", 2)).toBe(-1000);
  });
  it("feeds into dailyTarget", () => {
    const stats = { weightKg: 80, heightCm: 180, age: 30, sex: "male" as const, activityLevel: "moderate" as const };
    expect(dailyTarget(stats, "lose", 0.5)).toBe(Math.round(1780 * 1.55 - 550));
  });
});
