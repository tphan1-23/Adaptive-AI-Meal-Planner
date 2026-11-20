import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdherence } from "@/server/adherence/meal-logs";
import { withUser } from "@/server/auth/require-user";
import { isValidIsoDate } from "@/server/planning/week";

const isoDate = z.string().refine(isValidIsoDate, "Use a real date as YYYY-MM-DD");
const rangeInput = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// GET /api/adherence?from=YYYY-MM-DD&to=YYYY-MM-DD -> planned versus actual, for the dashboard charts:
// one row per day, one per calendar week (with average weight), totals, and how closely following the
// plan relates to weight change. Defaults to the last 4 weeks. Days after today are never included.
export const GET = withUser(async (userId, req: Request) => {
  const params = new URL(req.url).searchParams;
  const parsed = rangeInput.safeParse({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await getAdherence(userId, parsed.data.from, parsed.data.to));
});
