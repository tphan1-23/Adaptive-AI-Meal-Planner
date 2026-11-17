import { NextResponse } from "next/server";
import { z } from "zod";
import { generateForUser } from "@/server/ai/service";
import { withUser } from "@/server/auth/require-user";
import { isValidIsoDate } from "@/server/planning/week";

const input = z.object({
  wish: z.string().trim().max(200).optional(),
  date: z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD").optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
});

// POST /api/generate { wish?, date?, mealType? } -> a brand-new AI recipe built from the user's tastes.
// Nutrition is computed from ingredient data, not by the AI. Private to the user. With date,
// it is also added to that day as an extra. 422 if the result fails validation, so retry.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await generateForUser(userId, parsed.data));
});
