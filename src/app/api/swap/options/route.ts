import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { swapOptions } from "@/server/planning/service";

const input = z.object({
  entryId: z.string().min(1),
  request: z.string().trim().max(200).optional(),
});

// POST /api/swap/options { entryId, request? } -> up to 3 safe, ranked replacements for that meal. Read-only:
// nothing is changed and the AI is not called. Show them in the swap sheet, then send the chosen
// `recipeId` to POST /api/swap. (POST, not GET, because the optional request is free text.)
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await swapOptions(userId, parsed.data.entryId, parsed.data.request || undefined));
});
