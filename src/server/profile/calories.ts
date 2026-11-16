export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface BodyStats {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
}

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Daily calorie adjustment per goal (kcal). */
export const GOAL_DELTA: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

/** Never recommend below these, regardless of goal or weigh-in trend. */
export const CALORIE_FLOOR: Record<Sex, number> = {
  male: 1500,
  female: 1200,
};

/** Basal metabolic rate, Mifflin-St Jeor. */
export function bmr({ weightKg, heightCm, age, sex }: Pick<BodyStats, "weightKg" | "heightCm" | "age" | "sex">): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** Total daily energy expenditure. */
export function tdee(stats: BodyStats): number {
  return bmr(stats) * ACTIVITY_MULTIPLIER[stats.activityLevel];
}

/** Apply the safety floor to any target. */
export function applyFloor(target: number, sex: Sex): number {
  return Math.max(Math.round(target), CALORIE_FLOOR[sex]);
}

/** Starting daily calorie target for a user: TDEE + goal adjustment, floored. */
export function dailyTarget(stats: BodyStats, goal: Goal, goalRateKg?: number | null): number {
  return applyFloor(tdee(stats) + goalDelta(goal, goalRateKg), stats.sex);
}

/** ~7700 kcal per kg of body weight, spread over 7 days. */
export const KCAL_PER_KG_PER_DAY = 7700 / 7;
const MAX_DAILY_DEFICIT = 1000;

/** Daily calorie adjustment for a goal. Uses the user's weekly rate when given, else the default. */
export function goalDelta(goal: Goal, goalRateKg?: number | null): number {
  if (goal === "maintain" || goalRateKg == null) return GOAL_DELTA[goal];
  const delta = Math.round(goalRateKg * KCAL_PER_KG_PER_DAY);
  return goal === "lose" ? -Math.min(delta, MAX_DAILY_DEFICIT) : delta;
}
