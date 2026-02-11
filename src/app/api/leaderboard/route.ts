import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/scoring";
import { queryOne } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get("cohort_id") ?? undefined;

    const leaderboard = await getLeaderboard(cohortId);

    // Fetch summary stats for dashboard cards
    const summaryRow = await queryOne<{
      cohort_count: number;
      active_market_count: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM cohorts) AS cohort_count,
        (SELECT COUNT(*) FROM markets WHERE resolved = 0) AS active_market_count`
    );

    return NextResponse.json({
      leaderboard,
      cohort_count: summaryRow?.cohort_count ?? 0,
      active_market_count: summaryRow?.active_market_count ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
