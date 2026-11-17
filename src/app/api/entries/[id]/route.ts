import { NextResponse } from "next/server";
import { withUser } from "@/server/auth/require-user";
import { getEntryDetail } from "@/server/planning/service";

// GET /api/entries/:id -> one of the user's plan entries with its full recipe plus their own
// equipment conversion and modification, if any. Use this for the recipe detail page.
export const GET = withUser(async (userId, _req: Request, ctx: { params: { id: string } }) => {
  return NextResponse.json(await getEntryDetail(userId, ctx.params.id));
});
