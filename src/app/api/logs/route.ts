import { NextResponse } from "next/server";
import { withUser } from "@/server/auth/require-user";
import { listWeightLogs, logWeight, weightInput } from "@/server/profile/service";

// GET /api/logs -> recent weigh-ins, newest first
export const GET = withUser(async (userId) => {
  return NextResponse.json({ logs: await listWeightLogs(userId) });
});

// POST /api/logs { weightKg } -> save a weigh-in; may adjust the calorie target (at most weekly)
export const POST = withUser(async (userId, req: Request) => {
  const parsed = weightInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await logWeight(userId, parsed.data.weightKg), { status: 201 });
});
