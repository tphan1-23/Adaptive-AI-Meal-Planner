import { describe, expect, it } from "vitest";
import { targetInputsUnchanged, type TargetInputs } from "@/server/profile/target";

const base: TargetInputs = { heightCm: 178, weightKg: 82, age: 28, sex: "male", activityLevel: "moderate", goal: "lose", goalRateKg: 0.5 };

describe("targetInputsUnchanged", () => {
  it("is false for a first save", () => {
    expect(targetInputsUnchanged(null, base)).toBe(false);
  });
  it("is true when only other answers changed (they are not part of the input)", () => {
    expect(targetInputsUnchanged(base, { ...base })).toBe(true);
  });
  it("is false when any calorie input changes", () => {
    for (const change of [{ heightCm: 180 }, { weightKg: 80 }, { age: 29 }, { sex: "female" }, { activityLevel: "active" }, { goal: "gain" }, { goalRateKg: 0.75 }]) {
      expect(targetInputsUnchanged(base, { ...base, ...change })).toBe(false);
    }
  });
  it("treats a missing pace and a null pace as the same", () => {
    expect(targetInputsUnchanged({ ...base, goalRateKg: null }, { ...base, goalRateKg: null })).toBe(true);
  });
});
