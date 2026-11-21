import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAccount } from "@/server/account/service";
import { withUser } from "@/server/auth/require-user";

const input = z.object({
  confirm: z.literal("DELETE"),
  password: z.string().min(1).max(200),
});

// DELETE /api/account { confirm: "DELETE", password } -> permanently deletes the user's data and login.
// 403 for a wrong password. There is no undo.
export const DELETE = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Send { "confirm": "DELETE", "password": "..." }' }, { status: 400 });
  }
  return NextResponse.json(await deleteAccount(userId, parsed.data.password));
});
