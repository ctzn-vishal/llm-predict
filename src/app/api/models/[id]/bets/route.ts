import { NextRequest, NextResponse } from "next/server";
import { queryAll } from "@/lib/db";

// A forecaster's history: every blind forecast it made, joined with the market
// and (once settled) the outcome + Brier. Ordered newest first.
interface ForecastHistoryRow {
  id: number;
  round_id: string;
  cohort_id: string;
  market_id: string;
  forecaster_id: string;
  prob_yes: number | null;
  crowd_price: number | null;
  reasoning: string | null;
  ok: number;
  error: string | null;
  settled: number;
  outcome: number | null;
  brier: number | null;
  log_loss: number | null;
  api_cost: number;
  created_at: string;
  question: string;
  market_resolved: number;
  end_date: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const forecasts = await queryAll<ForecastHistoryRow>(
      `SELECT
        f.id, f.round_id, f.cohort_id, f.market_id, f.forecaster_id,
        f.prob_yes, f.crowd_price, f.reasoning, f.ok, f.error,
        f.settled, f.outcome, f.brier, f.log_loss, f.api_cost, f.created_at,
        mk.question, mk.resolved AS market_resolved, mk.end_date
      FROM forecasts f
      JOIN markets mk ON mk.id = f.market_id
      WHERE f.forecaster_id = @forecaster_id
      ORDER BY f.created_at DESC`,
      { forecaster_id: id },
    );

    return NextResponse.json(forecasts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
