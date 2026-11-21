/** The answers the calorie target is computed from. Diet, allergies, equipment and cuisines are not part of it. */
export interface TargetInputs {
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  sex: string | null;
  activityLevel: string | null;
  goal: string | null;
  goalRateKg: number | null;
}

/**
 * True when saving these answers would not change the starting target, so the stored target (which weekly
 * weigh-ins may have adjusted) should be kept. Editing only diet, allergies, equipment or cuisines must not
 * throw away those adjustments.
 */
export function targetInputsUnchanged(existing: TargetInputs | null, next: TargetInputs): boolean {
  if (!existing) return false;
  const same = <T>(a: T | null | undefined, b: T | null | undefined) => (a ?? null) === (b ?? null);
  return (
    same(existing.heightCm, next.heightCm) &&
    same(existing.weightKg, next.weightKg) &&
    same(existing.age, next.age) &&
    same(existing.sex, next.sex) &&
    same(existing.activityLevel, next.activityLevel) &&
    same(existing.goal, next.goal) &&
    same(existing.goalRateKg, next.goalRateKg)
  );
}
