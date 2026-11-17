import { NextResponse } from "next/server";
import { z } from "zod";
import { modifyEntry, resetModification } from "@/server/ai/service";
import { withUser } from "@/server/auth/require-user";

const input = z.object({ entryId: z.string().min(1), request: z.string().trim().min(3).max(200) });

// POST /api/modify { entryId, request } -> an AI-modified version of the recipe, for this user only
// ("make it vegetarian", "less spicy"). 422 if the result fails the allergy checks.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await modifyEntry(userId, parsed.data.entryId, parsed.data.request));
});

const resetInput = z.object({ entryId: z.string().min(1) });

// DELETE /api/modify { entryId } -> back to the original recipe
export const DELETE = withUser(async (userId, req: Request) => {
  const parsed = resetInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  await resetModification(userId, parsed.data.entryId);
  return NextResponse.json({ ok: true });
});
