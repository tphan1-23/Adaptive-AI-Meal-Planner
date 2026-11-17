import { NextResponse } from "next/server";
import { withUser } from "@/server/auth/require-user";
import { getRecipeForUser } from "@/server/planning/service";

// GET /api/recipes/:id -> full recipe (ingredients, steps, macros). Shared recipes and the
// user's own AI recipes only; anything else is 404.
export const GET = withUser(async (userId, _req: Request, ctx: { params: { id: string } }) => {
  return NextResponse.json({ recipe: await getRecipeForUser(userId, ctx.params.id) });
});
