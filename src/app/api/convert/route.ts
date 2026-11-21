import { NextResponse } from "next/server";
import { z } from "zod";
import { convertEntry } from "@/server/ai/service";
import { withUser } from "@/server/auth/require-user";
import { EQUIPMENT } from "@/server/db/vocab";

const input = z.object({
  entryId: z.string().min(1),
  // Optional: cook this meal with these appliances instead of the saved kitchen, for example ["air-fryer"].
  equipment: z.array(z.enum(EQUIPMENT)).min(1).max(EQUIPMENT.length).optional(),
});

// POST /api/convert { entryId, equipment? } -> steps adapted to the chosen appliances, or to the user's saved kitchen.
// { available: false, steps: <original>, note } when it cannot be converted or the AI is down.
// A successful conversion is cached on the entry (with the equipment it was made for), so asking again costs nothing.
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await convertEntry(userId, parsed.data.entryId, parsed.data.equipment));
});
