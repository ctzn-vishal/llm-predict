import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import type { CohortRow } from "@/lib/schemas";
import { getLeaderboard } from "@/lib/scoring";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cohort = await queryOne<CohortRow>(
      "SELECT * FROM cohorts WHERE id = @id",
      { id }
    );
    if (!cohort) {
      return NextResponse.json(
        { error: `Cohort ${id} not found` },
        { status: 404 }
      );
    }

    const leaderboard = await getLeaderboard(id);

    return NextResponse.json({ cohort, leaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
