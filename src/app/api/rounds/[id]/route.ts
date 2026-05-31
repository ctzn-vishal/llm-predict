import { NextRequest, NextResponse } from "next/server";
import { queryAll, queryOne } from "@/lib/db";
import type { RoundRow } from "@/lib/schemas";

// One forecast row enriched with the forecaster's display metadata and the
// market's question / crowd price / resolution state -- enough to render the
// "blind probability vs crowd vs outcome" comparison for a round.
interface ForecastWithDetails {
  id: number;
  round_id: string;
  cohort_id: string;
  market_id: string;
  forecaster_id: string;
  forecaster_kind: string;
  prob_yes: number | null;
  reasoning: string | null;
  key_factors: string | null;
  crowd_price: number | null;
  ok: number;
  error: string | null;
  api_cost: number;
  api_latency_ms: number;
  settled: number;
  outcome: number | null;
  brier: number | null;
  log_loss: number | null;
  created_at: string;
  // joined forecaster fields
  display_name: string;
  provider: string;
  avatar_emoji: string;
  color: string;
  // joined market fields
  question: string;
  market_yes_price: number | null;
  market_resolved: number;
  end_date: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const round = await queryOne<RoundRow>(
      "SELECT * FROM rounds WHERE id = @id",
      { id },
    );
    if (!round) {
      return NextResponse.json({ error: `Round ${id} not found` }, { status: 404 });
    }

    const forecasts = await queryAll<ForecastWithDetails>(
      `SELECT
        f.id, f.round_id, f.cohort_id, f.market_id, f.forecaster_id, f.forecaster_kind,
        f.prob_yes, f.reasoning, f.key_factors, f.crowd_price,
        f.ok, f.error, f.api_cost, f.api_latency_ms,
        f.settled, f.outcome, f.brier, f.log_loss, f.created_at,
        m.display_name, m.provider, m.avatar_emoji, m.color,
        mk.question, mk.yes_price AS market_yes_price,
        mk.resolved AS market_resolved, mk.end_date
      FROM forecasts f
      JOIN models m ON m.id = f.forecaster_id
      JOIN markets mk ON mk.id = f.market_id
      WHERE f.round_id = @round_id
      ORDER BY mk.question, m.display_name`,
      { round_id: id },
    );

    return NextResponse.json({ round, forecasts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
