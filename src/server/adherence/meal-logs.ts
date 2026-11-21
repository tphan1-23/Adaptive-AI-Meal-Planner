import { z } from "zod";
import { HttpError } from "../auth/require-user";
import { prisma } from "../db/prisma";
import { addDays, isoOf, isValidIsoDate, toDate, todayIso } from "../planning/week";
import { recordSignal } from "./service";
import {
  MEAL_STATUSES,
  adherenceVsWeight,
  summarize,
  summarizeDays,
  summarizeWeeks,
  type LoggedMeal,
  type MealStatus,
  type PlannedMeal,
} from "./analytics";

const isoDate = z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD");
const mealType = z.enum(["breakfast", "lunch", "dinner", "snack"]);

/**
 * What the user can send when logging a meal.
 * - eaten_as_planned / skipped: need `entryId` (the planned meal). Nutrition comes from the plan.
 * - modified: needs `entryId` and `calories` (what they really ate).
 * - ad_hoc: something not in the plan. Needs `calories`, and `date` and `mealType` (default today, dinner).
 */
export const mealLogInput = z
  .object({
    entryId: z.string().min(1).optional(),
    date: isoDate.optional(),
    mealType: mealType.optional(),
    status: z.enum(MEAL_STATUSES),
    calories: z.number().min(0).max(5000).optional(),
    proteinG: z.number().min(0).max(500).optional(),
    carbsG: z.number().min(0).max(1000).optional(),
    fatG: z.number().min(0).max(500).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    if (v.status === "eaten_as_planned" || v.status === "skipped") {
      need(!!v.entryId, "entryId", "Say which planned meal this is for");
    }
    if (v.status === "modified") {
      need(!!v.entryId, "entryId", "Say which planned meal this is for");
      need(v.calories !== undefined, "calories", "Say roughly how many calories you ate");
    }
    if (v.status === "ad_hoc") {
      need(v.calories !== undefined, "calories", "Say roughly how many calories you ate");
      need(!v.entryId, "entryId", "An ad hoc meal is not part of the plan");
    }
  });
export type MealLogInput = z.infer<typeof mealLogInput>;

const logSelect = {
  id: true, date: true, mealType: true, status: true, planEntryId: true,
  loggedCalories: true, loggedProteinG: true, loggedCarbsG: true, loggedFatG: true, note: true, createdAt: true,
  planEntry: { select: { recipe: { select: { id: true, name: true } } } },
} as const;

type LogRow = Awaited<ReturnType<typeof prisma.mealLog.findFirstOrThrow<{ select: typeof logSelect }>>>;

export function formatMealLog(l: LogRow) {
  return {
    id: l.id,
    date: isoOf(l.date),
    mealType: l.mealType,
    status: l.status as MealStatus,
    entryId: l.planEntryId,
    recipe: l.planEntry?.recipe ?? null,
    calories: l.loggedCalories,
    proteinG: l.loggedProteinG,
    carbsG: l.loggedCarbsG,
    fatG: l.loggedFatG,
    note: l.note,
    createdAt: l.createdAt.toISOString(),
  };
}

/** The latest day a meal may be logged for: today, plus one day to allow for time zones. */
function latestLoggableDate(): string {
  return addDays(todayIso(), 1);
}

/**
 * Record what the user ate. Logging the same planned meal again updates the earlier log, so there
 * is one log per planned meal. Skipping a meal teaches the preference model (a "skip" signal).
 */
export async function saveMealLog(userId: string, input: MealLogInput) {
  let date: string;
  let type: string;
  let planEntryId: string | null = null;
  let recipeId: string | null = null;
  let planned = { calories: null as number | null, proteinG: null as number | null, carbsG: null as number | null, fatG: null as number | null };

  if (input.entryId) {
    const entry = await prisma.planEntry.findFirst({
      where: { id: input.entryId, userId },
      select: {
        id: true, date: true, mealType: true, recipeId: true, modifiedRecipe: true,
        recipe: { select: { calories: true, proteinG: true, carbsG: true, fatG: true } },
      },
    });
    if (!entry) throw new HttpError(404, "Plan entry not found");
    planEntryId = entry.id;
    recipeId = entry.recipeId;
    date = isoOf(entry.date);
    type = entry.mealType;
    const modifiedCalories = (entry.modifiedRecipe as { calories?: unknown } | null)?.calories;
    const useModified = typeof modifiedCalories === "number";
    // A modified recipe has its own calories but no macro breakdown, so macros are only known for the original.
    planned = {
      calories: useModified ? (modifiedCalories as number) : entry.recipe.calories,
      proteinG: useModified ? null : entry.recipe.proteinG,
      carbsG: useModified ? null : entry.recipe.carbsG,
      fatG: useModified ? null : entry.recipe.fatG,
    };
  } else {
    date = input.date ?? todayIso();
    type = input.mealType ?? "dinner";
  }
  if (date > latestLoggableDate()) throw new HttpError(400, "You cannot log a meal in the future");

  const values =
    input.status === "skipped"
      ? { loggedCalories: 0, loggedProteinG: 0, loggedCarbsG: 0, loggedFatG: 0 }
      : input.status === "eaten_as_planned"
        ? { loggedCalories: planned.calories, loggedProteinG: planned.proteinG, loggedCarbsG: planned.carbsG, loggedFatG: planned.fatG }
        : {
            loggedCalories: input.calories ?? null,
            loggedProteinG: input.proteinG ?? null,
            loggedCarbsG: input.carbsG ?? null,
            loggedFatG: input.fatG ?? null,
          };

  const existing = planEntryId
    ? await prisma.mealLog.findFirst({ where: { userId, planEntryId }, select: { id: true, status: true } })
    : null;

  const data = { date: toDate(date), mealType: type, status: input.status, note: input.note ?? null, ...values };
  const saved = existing
    ? await prisma.mealLog.update({ where: { id: existing.id }, data, select: logSelect })
    : await prisma.mealLog.create({ data: { userId, planEntryId, ...data }, select: logSelect });

  // Only teach the preference model when a meal newly becomes skipped or eaten, not on every re-save.
  if (input.status === "skipped" && existing?.status !== "skipped" && recipeId) {
    await recordSignal(userId, recipeId, "skip");
  }
  if (input.status === "eaten_as_planned" && existing?.status !== "eaten_as_planned" && recipeId) {
    await recordSignal(userId, recipeId, "eaten");
  }
  return formatMealLog(saved);
}

export interface DateRange {
  from: string;
  to: string;
}

const MAX_DAYS = 120;
const DEFAULT_DAYS = 28;

/**
 * A valid range, newest day today at most. Defaults to the last 4 weeks. Planned meals after today
 * would look like missed meals, so the end is never later than today.
 */
export function resolveRange(from?: string, to?: string): DateRange {
  const today = todayIso();
  const end = to && to < today ? to : today;
  const start = from ?? addDays(end, -(DEFAULT_DAYS - 1));
  if (start > end) throw new HttpError(400, "'from' must not be after 'to'");
  const days = (toDate(end).getTime() - toDate(start).getTime()) / 86_400_000 + 1;
  if (days > MAX_DAYS) throw new HttpError(400, `Ask for at most ${MAX_DAYS} days at a time`);
  return { from: start, to: end };
}

/** The user's logs in a date range, newest first. */
export async function listMealLogs(userId: string, from?: string, to?: string) {
  const range = resolveRange(from, to);
  const rows = await prisma.mealLog.findMany({
    where: { userId, date: { gte: toDate(range.from), lte: toDate(range.to) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: logSelect,
  });
  return { from: range.from, to: range.to, logs: rows.map(formatMealLog) };
}

/** Delete one of the user's logs (undo). */
export async function deleteMealLog(userId: string, id: string) {
  const res = await prisma.mealLog.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new HttpError(404, "Log not found");
}

/**
 * Planned versus actual for the dashboard: one row per day, one per calendar week (with the
 * week's average weight), totals, and how closely following the plan relates to weight change.
 */
export async function getAdherence(userId: string, from?: string, to?: string) {
  const range = resolveRange(from, to);
  const gte = toDate(range.from);
  const lte = toDate(range.to);

  const [entries, logs, weights] = await Promise.all([
    prisma.planEntry.findMany({
      where: { userId, date: { gte, lte } },
      select: { date: true, modifiedRecipe: true, recipe: { select: { calories: true } } },
    }),
    prisma.mealLog.findMany({
      where: { userId, date: { gte, lte } },
      select: { date: true, status: true, loggedCalories: true, planEntryId: true },
    }),
    // A week earlier, so the first week's weight change can be worked out.
    prisma.weightLog.findMany({
      where: { userId, loggedAt: { gte: toDate(addDays(range.from, -7)), lt: toDate(addDays(range.to, 1)) } },
      select: { loggedAt: true, weightKg: true },
    }),
  ]);

  const planned: PlannedMeal[] = entries.map((e) => {
    const modified = (e.modifiedRecipe as { calories?: unknown } | null)?.calories;
    return { date: isoOf(e.date), calories: typeof modified === "number" ? modified : e.recipe.calories };
  });
  const logged: LoggedMeal[] = logs.map((l) => ({
    date: isoOf(l.date),
    status: l.status as MealStatus,
    calories: l.loggedCalories,
    planEntryId: l.planEntryId,
  }));

  const days = summarizeDays(range.from, range.to, planned, logged);
  const weeks = summarizeWeeks(days, weights.map((w) => ({ date: isoOf(w.loggedAt), weightKg: w.weightKg })));
  return {
    from: range.from,
    to: range.to,
    totals: summarize(days),
    days,
    weeks,
    adherenceVsWeight: adherenceVsWeight(weeks),
  };
}
