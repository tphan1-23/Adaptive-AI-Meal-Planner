import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { recommendForDay } from "@/server/planning/service";
import { isValidIsoDate, todayIso } from "@/server/planning/week";

const input = z.object({
  date: z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD").optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  extra: z.boolean().default(false),
});

// POST /api/recommendation { date?, mealType?, extra? } -> the recipe for that day.
// Without extra, a day that already has a pick returns it. With extra: true, adds another recipe.
// The AI picks from a shortlist built in code; `reason` explains a new pick (null otherwise).
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { date, mealType, extra } = parsed.data;
  return NextResponse.json(await recommendForDay(userId, { date: date ?? todayIso(), mealType, extra }));
});
