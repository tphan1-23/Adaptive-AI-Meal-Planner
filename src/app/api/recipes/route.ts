import { NextResponse } from "next/server";
import { withUser } from "@/server/auth/require-user";
import { browseInput, browseRecipes } from "@/server/planning/browse";

// GET /api/recipes?q=&mealType=&minCalories=&maxCalories=&sort=for-you|name|calories&saved=true&offset=&limit=
// -> { recipes: [{ id, name, calories, proteinG, tags, source, imageUrl, isFavorite }], total, hasMore, nextOffset }
// Only recipes that are safe for the user (allergies, diet) are listed. Open one with GET /api/recipes/:id.
export const GET = withUser(async (userId, req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = browseInput.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await browseRecipes(userId, parsed.data));
});
