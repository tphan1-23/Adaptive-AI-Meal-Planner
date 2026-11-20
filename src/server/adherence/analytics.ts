// Planned-versus-actual analytics. Pure functions only: the database part lives in meal-logs.ts.
//
// Vocabulary
//  - planned meal: a plan entry (one recipe on one day)
//  - logged meal:  what the user says they ate, with a status:
//      eaten_as_planned | modified | skipped | ad_hoc (something not in the plan)
//  - "followed": a planned meal that was logged as eaten_as_planned

import { addDays, mondayOf } from "../planning/week";

export const MEAL_STATUSES = ["eaten_as_planned", "modified", "skipped", "ad_hoc"] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export interface PlannedMeal {
  date: string; // YYYY-MM-DD
  calories: number;
}

export interface LoggedMeal {
  date: string;
  status: MealStatus;
  /** What was actually eaten. Skipped meals count as 0. */
  calories: number | null;
  /** Set when the log answers a planned meal, null for ad hoc meals. */
  planEntryId: string | null;
}

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface Counts {
  plannedMeals: number;
  /** Planned meals the user has logged something for. */
  loggedPlannedMeals: number;
  eatenAsPlanned: number;
  modified: number;
  skipped: number;
  adHoc: number;
  plannedCalories: number;
  actualCalories: number;
  /** Days with at least one log. */
  loggedDays: number;
  /** Planned calories on the days that have a log, so unlogged days do not look like undereating. */
  plannedCaloriesOnLoggedDays: number;
}

export interface DaySummary extends Counts {
  date: string;
}

export interface Summary extends Counts {
  /** Logged planned meals out of all planned meals (0 to 1), or null when nothing was planned. */
  loggedShare: number | null;
  /** Of the planned meals that were logged, the share eaten exactly as planned (0 to 1). */
  followedRate: number | null;
  /** Average daily difference (actual minus planned) over days that have a log. Positive = ate more. */
  calorieDifferencePerDay: number | null;
}

export interface WeekSummary extends Summary {
  weekStart: string;
  /** Average of that week's weigh-ins. */
  avgWeightKg: number | null;
  /** Change from the previous calendar week's average, or null if either week has no weigh-in. */
  weightChangeKg: number | null;
}

const round = (x: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

function emptyCounts(): Counts {
  return {
    plannedMeals: 0, loggedPlannedMeals: 0, eatenAsPlanned: 0, modified: 0, skipped: 0, adHoc: 0,
    plannedCalories: 0, actualCalories: 0, loggedDays: 0, plannedCaloriesOnLoggedDays: 0,
  };
}

/** Every date from `from` to `to`, both included. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One summary per day in the range, including days with nothing planned or logged. */
export function summarizeDays(from: string, to: string, planned: PlannedMeal[], logged: LoggedMeal[]): DaySummary[] {
  const byDay = new Map<string, DaySummary>(dateRange(from, to).map((d) => [d, { date: d, ...emptyCounts() }]));

  for (const p of planned) {
    const day = byDay.get(p.date);
    if (!day) continue;
    day.plannedMeals += 1;
    day.plannedCalories += p.calories;
  }
  for (const l of logged) {
    const day = byDay.get(l.date);
    if (!day) continue;
    if (l.planEntryId) day.loggedPlannedMeals += 1;
    if (l.status === "eaten_as_planned") day.eatenAsPlanned += 1;
    else if (l.status === "modified") day.modified += 1;
    else if (l.status === "skipped") day.skipped += 1;
    else day.adHoc += 1;
    if (l.status !== "skipped") day.actualCalories += l.calories ?? 0;
  }
  for (const day of byDay.values()) {
    if (day.loggedPlannedMeals + day.adHoc > 0) {
      day.loggedDays = 1;
      day.plannedCaloriesOnLoggedDays = day.plannedCalories;
    }
    day.plannedCalories = round(day.plannedCalories, 0);
    day.actualCalories = round(day.actualCalories, 0);
    day.plannedCaloriesOnLoggedDays = round(day.plannedCaloriesOnLoggedDays, 0);
  }
  return [...byDay.values()];
}

/** Adds up day summaries and works out the rates. */
export function summarize(days: DaySummary[]): Summary {
  const total = emptyCounts();
  for (const d of days) {
    (Object.keys(total) as (keyof Counts)[]).forEach((k) => {
      total[k] += d[k];
    });
  }
  return {
    ...total,
    plannedCalories: round(total.plannedCalories, 0),
    actualCalories: round(total.actualCalories, 0),
    plannedCaloriesOnLoggedDays: round(total.plannedCaloriesOnLoggedDays, 0),
    loggedShare: total.plannedMeals > 0 ? round(total.loggedPlannedMeals / total.plannedMeals) : null,
    followedRate: total.loggedPlannedMeals > 0 ? round(total.eatenAsPlanned / total.loggedPlannedMeals) : null,
    calorieDifferencePerDay:
      total.loggedDays > 0 ? round((total.actualCalories - total.plannedCaloriesOnLoggedDays) / total.loggedDays, 0) : null,
  };
}

/** Calendar weeks (Monday start) covering the day summaries, with that week's average weight and its change. */
export function summarizeWeeks(days: DaySummary[], weights: WeightPoint[]): WeekSummary[] {
  const weeks = new Map<string, DaySummary[]>();
  for (const d of days) {
    const key = mondayOf(d.date);
    weeks.set(key, [...(weeks.get(key) ?? []), d]);
  }

  const weightByWeek = new Map<string, number[]>();
  for (const w of weights) {
    const key = mondayOf(w.date);
    weightByWeek.set(key, [...(weightByWeek.get(key) ?? []), w.weightKg]);
  }
  const avg = (xs: number[] | undefined) => (xs && xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return [...weeks.keys()].sort().map((weekStart) => {
    const current = avg(weightByWeek.get(weekStart));
    const previous = avg(weightByWeek.get(addDays(weekStart, -7)));
    return {
      weekStart,
      ...summarize(weeks.get(weekStart)!),
      avgWeightKg: current === null ? null : round(current),
      weightChangeKg: current !== null && previous !== null ? round(current - previous) : null,
    };
  });
}

/** Pearson correlation of two equal-length lists, or null if it is not defined (fewer than 3 pairs or no spread). */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return round(sxy / Math.sqrt(sxx * syy));
}

export interface AdherenceVsWeight {
  /** -1 to 1, or null when there is not enough data. Positive: following the plan more closely goes with weight going up. */
  r: number | null;
  /** Weeks that had both a follow rate and a weight change. */
  weeks: number;
  note: string;
}

const MIN_WEEKS = 3;

/** Relates how closely the plan was followed to the weekly weight change. A hint, not proof of cause. */
export function adherenceVsWeight(weeks: WeekSummary[]): AdherenceVsWeight {
  const pairs = weeks.filter((w) => w.followedRate !== null && w.weightChangeKg !== null);
  if (pairs.length < MIN_WEEKS) {
    return {
      r: null,
      weeks: pairs.length,
      note: `Not enough data yet: log meals and weigh in for at least ${MIN_WEEKS} weeks in a row (${pairs.length} so far).`,
    };
  }
  const r = pearson(pairs.map((w) => w.followedRate!), pairs.map((w) => w.weightChangeKg!));
  return {
    r,
    weeks: pairs.length,
    note:
      r === null
        ? "No pattern can be measured yet because the values barely change from week to week."
        : `Compares how closely you followed the plan each week with your weekly weight change, over ${pairs.length} weeks. It shows a pattern, not a cause.`,
  };
}
