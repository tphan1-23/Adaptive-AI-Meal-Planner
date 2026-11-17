import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { createWeekPlan, getWeekPlan } from "@/server/planning/service";
import { isValidIsoDate } from "@/server/planning/week";

const isoDate = z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD");

// GET /api/plan?date=YYYY-MM-DD -> the plan for the week containing that date (default: this week).
// 404 if no plan exists yet; call POST to create one.
export const GET = withUser(async (userId, req: Request) => {
  const raw = new URL(req.url).searchParams.get("date") ?? undefined;
  const date = raw === undefined ? undefined : isoDate.safeParse(raw);
  if (date && !date.success) return NextResponse.json({ error: date.error.issues[0].message }, { status: 400 });
  const plan = await getWeekPlan(userId, date?.data);
  if (!plan) return NextResponse.json({ error: "No plan for this week" }, { status: 404 });
  return NextResponse.json({ plan });
});

const postInput = z.object({ date: isoDate.optional(), regenerate: z.boolean().default(false) });

// POST /api/plan { date?, regenerate? } -> plan a week of dinners (one recipe per day).
// Returns the existing plan unless regenerate is true. Needs a finished profile.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = postInput.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const plan = await createWeekPlan(userId, parsed.data.date, parsed.data.regenerate);
  return NextResponse.json({ plan });
});
