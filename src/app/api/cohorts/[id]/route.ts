import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import type { CohortRow } from "@/lib/schemas";
import { getLeaderboard, getPortfolioHistory } from "@/lib/scoring";

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

    // Fetch portfolio history for each model
    const histories = await Promise.all(
      leaderboard.map(m => getPortfolioHistory(id, m.model_id).then(h => ({ modelId: m.model_id, history: h })))
    );

    // Combine into a unified timeline
    const allDates = new Set<string>();
    histories.forEach(h => h.history.forEach(p => allDates.add(p.date)));
    const sortedDates = Array.from(allDates).sort();

    const timeline = sortedDates.map(date => {
      const point: Record<string, string | number> = { date };
      histories.forEach(h => {
        // Forward fill: find the latest balance up to this date
        // Since history is sorted by date
        let bankroll = 10000;
        for (const p of h.history) {
          if (p.date > date) break;
          bankroll = p.bankroll;
        }
        point[h.modelId] = bankroll;
      });
      return point;
    });

    return NextResponse.json({ cohort, leaderboard, timeline });

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
