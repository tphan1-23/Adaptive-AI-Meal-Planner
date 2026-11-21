import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { swapEntry } from "@/server/planning/service";

const input = z.object({
  entryId: z.string().min(1),
  request: z.string().trim().max(200).optional(),
  // A choice from GET-style /api/swap/options. Must still be in the user's safe pool, else 422.
  recipeId: z.string().min(1).max(64).optional(),
});

// POST /api/swap { entryId, request?, recipeId? } -> replaces that plan entry's recipe with another that fits the user.
// `request` is optional plain text such as "something with chicken" or "lighter, no onions": the new recipe
// is chosen from recipes matching it (still inside the user's diet and allergies). If nothing matches,
// a normal swap is done and `matchedRequest` is false. With `recipeId` (one of the options from
// POST /api/swap/options) that exact recipe is used, after re-checking it is still a safe option.
// Clears any conversion or modification on the entry and teaches the preference model.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { entryId, request, recipeId } = parsed.data;
  return NextResponse.json(await swapEntry(userId, entryId, request || undefined, recipeId));
});
