import { NextRequest, NextResponse } from "next/server";
import { queryAll, queryOne } from "@/lib/db";
import type { RoundRow } from "@/lib/schemas";

interface BetWithDetails {
  id: number;
  model_id: string;
  market_id: string;
  cohort_id: string;
  round_id: string;
  action: string;
  confidence: number | null;
  bet_size_pct: number | null;
  bet_amount: number | null;
  estimated_probability: number | null;
  market_price_at_bet: number | null;
  reasoning: string | null;
  key_factors: string | null;
  settled: number;
  pnl: number;
  brier_score: number | null;
  api_cost: number;
  api_latency_ms: number;
  created_at: string;
  // joined model fields
  display_name: string;
  provider: string;
  avatar_emoji: string;
  color: string;
  // joined market fields
  question: string;
  market_yes_price: number | null;
  market_resolved: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const round = await queryOne<RoundRow>(
      "SELECT * FROM rounds WHERE id = @id",
      { id }
    );
    if (!round) {
      return NextResponse.json(
        { error: `Round ${id} not found` },
        { status: 404 }
      );
    }

    const bets = await queryAll<BetWithDetails>(
      `SELECT
        b.id, b.model_id, b.market_id, b.cohort_id, b.round_id,
        b.action, b.confidence, b.bet_size_pct, b.bet_amount,
        b.estimated_probability, b.market_price_at_bet,
        b.reasoning, b.key_factors, b.settled, b.pnl, b.brier_score,
        b.api_cost, b.api_latency_ms, b.created_at,
        m.display_name, m.provider, m.avatar_emoji, m.color,
        mk.question, mk.yes_price AS market_yes_price, mk.resolved AS market_resolved
      FROM bets b
      JOIN models m ON m.id = b.model_id
      JOIN markets mk ON mk.id = b.market_id
      WHERE b.round_id = @round_id
      ORDER BY mk.question, m.display_name`,
      { round_id: id }
    );

    return NextResponse.json({ round, bets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
