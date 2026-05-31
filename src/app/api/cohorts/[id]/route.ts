import { NextRequest, NextResponse } from "next/server";
import { queryAll, queryOne } from "@/lib/db";
import type { CohortRow, RoundRow } from "@/lib/schemas";
import { getLeaderboard, getEnsembleComparison } from "@/lib/scoring";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const cohort = await queryOne<CohortRow>(
      "SELECT * FROM cohorts WHERE id = @id",
      { id },
    );
    if (!cohort) {
      return NextResponse.json({ error: `Cohort ${id} not found` }, { status: 404 });
    }

    const [leaderboard, comparison, rounds] = await Promise.all([
      getLeaderboard(id),
      getEnsembleComparison(id),
      queryAll<RoundRow>(
        "SELECT * FROM rounds WHERE cohort_id = @id ORDER BY created_at DESC",
        { id },
      ),
    ]);

    return NextResponse.json({ cohort, leaderboard, comparison, rounds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
