import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { swapEntry } from "@/server/planning/service";

const input = z.object({
  entryId: z.string().min(1),
  request: z.string().trim().max(200).optional(),
});

// POST /api/swap { entryId, request? } -> replaces that plan entry's recipe with another that fits the user.
// `request` is optional plain text such as "something with chicken" or "lighter, no onions": the new recipe
// is chosen from recipes matching it (still inside the user's diet and allergies). If nothing matches,
// a normal swap is done and `matchedRequest` is false. Clears any conversion or modification on the
// entry and teaches the preference model.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await swapEntry(userId, parsed.data.entryId, parsed.data.request || undefined));
});
