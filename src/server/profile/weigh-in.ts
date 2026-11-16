import { applyFloor, type Goal, type Sex } from "./calories";

/** Ignore trend differences smaller than this (kg per week): weight is noisy. */
export const TOLERANCE_KG_PER_WEEK = 0.2;
/** How much the daily calorie target moves per adjustment. */
export const STEP_KCAL = 100;
/** Hard upper bound so a bad trend can never push the target absurdly high. */
export const MAX_TARGET = 5000;
/** A trend needs at least this many days between the first and last weigh-in. */
export const MIN_SPAN_DAYS = 5;
const DAY_MS = 86_400_000;

export interface WeightPoint {
  weightKg: number;
  loggedAt: Date;
}

/** Expected weekly weight change in kg for a goal (negative = losing). */
export function expectedWeeklyChange(goal: Goal, goalRateKg?: number | null): number {
  if (goal === "maintain") return 0;
  const rate = goalRateKg ?? (goal === "lose" ? 0.5 : 0.25);
  return goal === "lose" ? -rate : rate;
}

/**
 * Weekly weight trend in kg/week from a least-squares line over the last `windowDays`.
 * Returns null when there is not enough data to say anything.
 */
export function weeklyTrend(logs: WeightPoint[], windowDays = 21): number | null {
  if (logs.length < 2) return null;
  const sorted = [...logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const newest = sorted[sorted.length - 1].loggedAt.getTime();
  const pts = sorted.filter((p) => newest - p.loggedAt.getTime() <= windowDays * DAY_MS);
  if (pts.length < 2) return null;

  const t0 = pts[0].loggedAt.getTime();
  const xs = pts.map((p) => (p.loggedAt.getTime() - t0) / DAY_MS);
  if (xs[xs.length - 1] < MIN_SPAN_DAYS) return null;

  const n = pts.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = pts.reduce((s, p) => s + p.weightKg, 0) / n;
  let num = 0;
  let den = 0;
  pts.forEach((p, i) => {
    num += (xs[i] - mx) * (p.weightKg - my);
    den += (xs[i] - mx) ** 2;
  });
  return den === 0 ? null : (num / den) * 7;
}

export interface AdjustInput {
  currentTarget: number;
  sex: Sex;
  goal: Goal;
  goalRateKg?: number | null;
  logs: WeightPoint[];
}

export interface AdjustResult {
  newTarget: number;
  changed: boolean;
  trendKgPerWeek: number | null;
  expectedKgPerWeek: number;
  reason: string;
}

/**
 * Nudge the daily calorie target by one small step if the real weight trend is off the
 * goal's pace. Never below the safety floor, never above MAX_TARGET.
 *  - trend too high (gaining faster / losing slower than wanted) -> fewer calories
 *  - trend too low  (losing faster / gaining slower than wanted) -> more calories
 */
export function adjustTarget(input: AdjustInput): AdjustResult {
  const expected = expectedWeeklyChange(input.goal, input.goalRateKg);
  const trend = weeklyTrend(input.logs);
  const keep = (reason: string): AdjustResult => ({
    newTarget: applyFloor(input.currentTarget, input.sex),
    changed: false,
    trendKgPerWeek: trend,
    expectedKgPerWeek: expected,
    reason,
  });

  if (trend === null) return keep("Not enough weigh-ins yet to see a trend.");

  const diff = trend - expected;
  if (Math.abs(diff) <= TOLERANCE_KG_PER_WEEK) return keep("On track, target unchanged.");

  const raw = input.currentTarget + (diff > 0 ? -STEP_KCAL : STEP_KCAL);
  const newTarget = Math.min(applyFloor(raw, input.sex), MAX_TARGET);
  const reason =
    diff > 0
      ? "Weight is trending higher than your goal, so the target was lowered slightly."
      : "Weight is trending lower than your goal, so the target was raised slightly.";
  const changed = newTarget !== input.currentTarget;
  return {
    newTarget,
    changed,
    trendKgPerWeek: trend,
    expectedKgPerWeek: expected,
    reason: changed ? reason : "Already at the calorie safety limit, target unchanged.",
  };
}
