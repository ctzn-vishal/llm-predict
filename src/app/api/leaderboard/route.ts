import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/scoring";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get("cohort_id") ?? undefined;

    const leaderboard = await getLeaderboard(cohortId);
    return NextResponse.json(leaderboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
