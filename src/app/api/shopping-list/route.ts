import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { WEEK_START, getShoppingList, setItemChecked } from "@/server/shopping-list/service";

// GET /api/shopping-list?weekStart=YYYY-MM-DD -> deduplicated list for that week's plan
// (omit weekStart for the most recent plan). 404 if the user has no plan yet.
export const GET = withUser(async (userId, req: Request) => {
  const weekStart = new URL(req.url).searchParams.get("weekStart") ?? undefined;
  if (weekStart && !WEEK_START.test(weekStart)) {
    return NextResponse.json({ error: "weekStart must be YYYY-MM-DD" }, { status: 400 });
  }
  const list = await getShoppingList(userId, weekStart);
  if (!list) return NextResponse.json({ error: "No plan found" }, { status: 404 });
  return NextResponse.json(list);
});

const patchInput = z.object({ itemId: z.string().min(1), checked: z.boolean() });

// PATCH /api/shopping-list { itemId, checked } -> tick or untick an item
export const PATCH = withUser(async (userId, req: Request) => {
  const parsed = patchInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const ok = await setItemChecked(userId, parsed.data.itemId, parsed.data.checked);
  if (!ok) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
