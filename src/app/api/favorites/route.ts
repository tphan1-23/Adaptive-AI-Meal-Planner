import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/server/auth/require-user";
import { addFavorite, listFavorites, removeFavorite } from "@/server/favorites/service";

const input = z.object({ recipeId: z.string().min(1).max(64) });

// GET /api/favorites -> { favorites: [ { id, name, calories, ..., imageUrl, savedAt } ] }, newest first
export const GET = withUser(async (userId) => NextResponse.json({ favorites: await listFavorites(userId) }));

// POST /api/favorites { recipeId } -> save a recipe (201 when new, 200 when it was already saved)
export const POST = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  const res = await addFavorite(userId, parsed.data.recipeId);
  return NextResponse.json(res, { status: res.created ? 201 : 200 });
});

// DELETE /api/favorites { recipeId } -> remove a saved recipe
export const DELETE = withUser(async (userId, req: Request) => {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await removeFavorite(userId, parsed.data.recipeId));
});
