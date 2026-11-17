import { NextResponse } from "next/server";
import { z } from "zod";
import { suggestSubstitutes } from "@/server/ai/service";
import { withUser } from "@/server/auth/require-user";

const input = z.object({ entryId: z.string().min(1), ingredient: z.string().trim().min(1).max(100) });

// POST /api/substitute { entryId, ingredient } -> up to 3 swaps for one ingredient of that recipe.
// Found by nutrition matching in the same food category, never containing the user's allergens
// and respecting their diet. The first suggestion's note is worded by the AI when available.
// 404 if the ingredient is not in the recipe, 422 if we have no nutrition data for it.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await suggestSubstitutes(userId, parsed.data.entryId, parsed.data.ingredient));
});
