import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteMealLog, listMealLogs, mealLogInput, saveMealLog } from "@/server/adherence/meal-logs";
import { withUser } from "@/server/auth/require-user";
import { isValidIsoDate } from "@/server/planning/week";

const isoDate = z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD");
const rangeInput = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// GET /api/meal-logs?from=YYYY-MM-DD&to=YYYY-MM-DD -> what the user logged eating, newest first.
// Defaults to the last 4 weeks (at most 120 days).
export const GET = withUser(async (userId, req: Request) => {
  const params = new URL(req.url).searchParams;
  const parsed = rangeInput.safeParse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await listMealLogs(userId, parsed.data.from, parsed.data.to));
});

// POST /api/meal-logs { entryId?, status, calories?, proteinG?, carbsG?, fatG?, note?, date?, mealType? }
// -> record what was eaten. status is eaten_as_planned | modified | skipped | ad_hoc.
// Logging the same planned meal again updates the earlier log. Skipping teaches the preference model.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = mealLogInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json({ log: await saveMealLog(userId, parsed.data) }, { status: 201 });
});

const deleteInput = z.object({ id: z.string().min(1) });

// DELETE /api/meal-logs { id } -> remove a log (undo)
export const DELETE = withUser(async (userId, req: Request) => {
  const parsed = deleteInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  await deleteMealLog(userId, parsed.data.id);
  return NextResponse.json({ ok: true });
});
