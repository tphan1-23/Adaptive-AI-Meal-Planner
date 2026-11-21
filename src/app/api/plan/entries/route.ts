import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { addRecipeToDay } from "@/server/planning/service";
import { isValidIsoDate } from "@/server/planning/week";

const input = z.object({
  date: z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD"),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  recipeId: z.string().min(1).max(64),
});

// POST /api/plan/entries { date, mealType?, recipeId } -> add this recipe to that day as another meal.
// Nothing is replaced. 422 if the recipe is not safe for the user (allergies, diet), 400 for a date far away.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await addRecipeToDay(userId, parsed.data), { status: 201 });
});
