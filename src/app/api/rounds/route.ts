import { NextRequest, NextResponse } from "next/server";
import { queryAll } from "@/lib/db";
import type { RoundRow } from "@/lib/schemas";
import { runRound } from "@/lib/prediction";
import { syncMarkets } from "@/lib/polymarket";
import { ensureActiveCohort } from "@/lib/cohort";
import { canAffordRound, getTotalSpent, getBudgetCap } from "@/lib/cost-tracker";

export const maxDuration = 300;

export async function POST() {
  try {
    if (!(await canAffordRound())) {
      const spent = await getTotalSpent();
      const cap = getBudgetCap();
      return NextResponse.json(
        { error: `Budget exhausted. Spent $${spent.toFixed(2)} of $${cap.toFixed(2)} cap. No more rounds allowed.` },
        { status: 403 },
      );
    }

    const cohort = await ensureActiveCohort();

    // Refresh the market cache so we forecast on fresh, short-horizon markets.
    await syncMarkets();

    const result = await runRound(cohort.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get("cohort_id");

    // Each round carries its forecast counts so the list can show progress.
    const rounds = await queryAll<RoundRow & { forecast_count: number; ok_count: number }>(
      `SELECT r.*,
              COUNT(f.id) AS forecast_count,
              COALESCE(SUM(f.ok), 0) AS ok_count
       FROM rounds r
       LEFT JOIN forecasts f ON f.round_id = r.id
       ${cohortId ? "WHERE r.cohort_id = @cohort_id" : ""}
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      cohortId ? { cohort_id: cohortId } : undefined,
    );

    return NextResponse.json(rounds);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
