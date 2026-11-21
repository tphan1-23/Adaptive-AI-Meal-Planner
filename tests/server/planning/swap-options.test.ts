import { describe, expect, it } from "vitest";
import { describeOption } from "@/server/planning/service";

describe("describeOption", () => {
  const none = new Set<string>();
  it("says on target when calories are close", () => {
    expect(describeOption({ calories: 650, tags: [] }, 640, none)).toBe("On target for this meal");
  });
  it("says how far a lighter or heavier recipe is", () => {
    expect(describeOption({ calories: 500, tags: [] }, 640, none)).toBe("140 kcal lighter than your target");
    expect(describeOption({ calories: 800, tags: [] }, 640, none)).toBe("160 kcal above your target");
  });
  it("adds a liked tag when the recipe has one", () => {
    expect(describeOption({ calories: 640, tags: ["main-dish", "middle-eastern"] }, 640, new Set(["middle-eastern"]))).toBe(
      "On target for this meal · matches middle eastern dishes you like",
    );
  });
});
