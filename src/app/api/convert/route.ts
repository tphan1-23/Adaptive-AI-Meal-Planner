import { NextResponse } from "next/server";
import { z } from "zod";
import { convertEntry } from "@/server/ai/service";
import { withUser } from "@/server/auth/require-user";

const input = z.object({ entryId: z.string().min(1) });

// POST /api/convert { entryId } -> steps adapted to the user's kitchen equipment.
// { available: false, steps: <original>, note } when it cannot be converted or the AI is down.
// A successful conversion is cached on the entry, so asking again costs nothing.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await convertEntry(userId, parsed.data.entryId));
});
