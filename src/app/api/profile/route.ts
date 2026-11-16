import { NextResponse } from "next/server";
import { withUser } from "@/server/auth/require-user";
import { getProfile, profileInput, saveProfile } from "@/server/profile/service";

// GET /api/profile -> the logged-in user's profile (or null before onboarding)
export const GET = withUser(async (userId) => {
  return NextResponse.json({ profile: await getProfile(userId) });
});

// PUT /api/profile -> save onboarding answers; returns the profile with the computed calorieTarget
export const PUT = withUser(async (userId, req: Request) => {
  const parsed = profileInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json({ profile: await saveProfile(userId, parsed.data) });
});
