import { z } from "zod";
import { prisma } from "../db/prisma";
import { ALLERGENS, CUISINES, DIETS, EQUIPMENT } from "../db/vocab";
import { dailyTarget, type ActivityLevel, type Goal, type Sex } from "./calories";
import { adjustTarget, type AdjustResult } from "./weigh-in";

/** A weigh-in only triggers a target adjustment if the previous one was at least this many days ago. */
const MIN_DAYS_BETWEEN_ADJUSTMENTS = 6;
const DAY_MS = 86_400_000;

export const profileInput = z.object({
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(300),
  age: z.number().int().min(13).max(100),
  sex: z.enum(["male", "female"]),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goal: z.enum(["lose", "maintain", "gain"]),
  goalRateKg: z.number().min(0).max(1).nullable().optional(),
  cuisines: z.array(z.enum(CUISINES)).max(CUISINES.length).default([]),
  diet: z.enum(DIETS).nullable().optional(),
  allergies: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
  equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).default([]),
});
export type ProfileInput = z.infer<typeof profileInput>;

export const weightInput = z.object({ weightKg: z.number().min(30).max(300) });

export async function getProfile(userId: string) {
  return prisma.profile.findUnique({ where: { id: userId } });
}

/** Create or update the user's profile and (re)compute their starting calorie target. */
export async function saveProfile(userId: string, input: ProfileInput) {
  const calorieTarget = dailyTarget(
    {
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      sex: input.sex,
      activityLevel: input.activityLevel,
    },
    input.goal,
    input.goalRateKg,
  );
  const data = { ...input, goalRateKg: input.goalRateKg ?? null, diet: input.diet ?? null, calorieTarget };
  const profile = await prisma.profile.upsert({
    where: { id: userId },
    create: { id: userId, ...data },
    update: data,
  });
  // Record the starting weight so the first trend has a baseline.
  const hasLogs = await prisma.weightLog.count({ where: { userId } });
  if (!hasLogs) await prisma.weightLog.create({ data: { userId, weightKg: input.weightKg } });
  return profile;
}

export async function listWeightLogs(userId: string, limit = 30) {
  return prisma.weightLog.findMany({ where: { userId }, orderBy: { loggedAt: "desc" }, take: limit });
}

/**
 * Save a weigh-in. If it comes at least a week after the previous one, check the trend and
 * nudge the calorie target. Returns the saved log and, when evaluated, the adjustment result.
 */
export async function logWeight(userId: string, weightKg: number) {
  const previous = await prisma.weightLog.findFirst({ where: { userId }, orderBy: { loggedAt: "desc" } });
  const log = await prisma.weightLog.create({ data: { userId, weightKg } });
  await prisma.profile.updateMany({ where: { id: userId }, data: { weightKg } });

  const profile = await getProfile(userId);
  const evaluate =
    profile?.calorieTarget != null &&
    profile.sex != null &&
    profile.goal != null &&
    previous != null &&
    log.loggedAt.getTime() - previous.loggedAt.getTime() >= MIN_DAYS_BETWEEN_ADJUSTMENTS * DAY_MS;

  if (!evaluate || !profile) return { log, adjustment: null as AdjustResult | null };

  const recent = await prisma.weightLog.findMany({
    where: { userId },
    orderBy: { loggedAt: "desc" },
    take: 12,
  });
  const adjustment = adjustTarget({
    currentTarget: profile.calorieTarget!,
    sex: profile.sex as Sex,
    goal: profile.goal as Goal,
    goalRateKg: profile.goalRateKg,
    logs: recent,
  });
  if (adjustment.changed) {
    await prisma.profile.update({ where: { id: userId }, data: { calorieTarget: adjustment.newTarget } });
  }
  return { log, adjustment };
}

export type { ActivityLevel };
