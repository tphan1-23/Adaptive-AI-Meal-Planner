import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { topTags } from "@/server/adherence/affinity";
import { getAffinity, recordSignal } from "@/server/adherence/service";

// GET /api/signals -> the user's learned tag scores plus their top liked / disliked tags
export const GET = withUser(async (userId) => {
  const affinity = await getAffinity(userId);
  return NextResponse.json({ affinity, ...topTags(affinity) });
});

const input = z
  .object({
    recipeId: z.string().min(1),
    type: z.enum(["swap_out", "swap_in", "rating", "favorite", "skip"]),
    value: z.number().min(1).max(5).optional(), // star rating, required for "rating"
  })
  .refine((v) => v.type !== "rating" || v.value !== undefined, { message: "rating needs a value from 1 to 5" });

// POST /api/signals { recipeId, type, value? } -> record a swap, rating, favorite or skip
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const { recipeId, type, value } = parsed.data;
  const updated = await recordSignal(userId, recipeId, type, value);
  if (!updated) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  return NextResponse.json({ updatedTags: updated }, { status: 201 });
});
