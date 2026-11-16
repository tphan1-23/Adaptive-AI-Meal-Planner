import { describe, it, expect } from "vitest";
import { bmr, tdee, dailyTarget, applyFloor, type BodyStats } from "@/server/profile/calories";

const male: BodyStats = { weightKg: 80, heightCm: 180, age: 30, sex: "male", activityLevel: "moderate" };
const female: BodyStats = { weightKg: 60, heightCm: 165, age: 25, sex: "female", activityLevel: "sedentary" };

describe("calories", () => {
  it("computes Mifflin-St Jeor BMR for a male", () => {
    expect(bmr(male)).toBe(1780);
  });

  it("computes Mifflin-St Jeor BMR for a female", () => {
    expect(bmr(female)).toBe(1345.25);
  });

  it("multiplies BMR by the activity level for TDEE", () => {
    expect(tdee(male)).toBeCloseTo(1780 * 1.55);
  });

  it("applies the goal adjustment", () => {
    expect(dailyTarget(male, "lose")).toBe(Math.round(1780 * 1.55 - 500));
    expect(dailyTarget(male, "gain")).toBe(Math.round(1780 * 1.55 + 300));
    expect(dailyTarget(male, "maintain")).toBe(Math.round(1780 * 1.55));
  });

  it("never goes below the safety floor", () => {
    expect(applyFloor(900, "female")).toBe(1200);
    expect(applyFloor(900, "male")).toBe(1500);
    expect(dailyTarget({ ...female, weightKg: 40, heightCm: 150, age: 60 }, "lose")).toBeGreaterThanOrEqual(1200);
  });
});
