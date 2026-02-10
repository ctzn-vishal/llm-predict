import { NextRequest, NextResponse } from "next/server";
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from "date-fns";
import { queryAll, queryOne, run, transaction } from "@/lib/db";
import type { CohortRow, ModelRow } from "@/lib/schemas";
import { runRound } from "@/lib/prediction";
import { syncMarkets } from "@/lib/polymarket";
import { canAffordRound, getTotalSpent, getBudgetCap } from "@/lib/cost-tracker";

export const maxDuration = 300;

async function ensureActiveCohort(): Promise<CohortRow> {
  let cohort = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE status = 'active' LIMIT 1"
  );
  if (cohort) return cohort;

  const now = new Date();
  const weekNum = getISOWeek(now);
  const weekYear = getISOWeekYear(now);
  const cohortId = `${weekYear}-W${String(weekNum).padStart(2, "0")}`;
  const startDate = startOfISOWeek(now).toISOString();
  const endDate = endOfISOWeek(now).toISOString();

  await transaction(async (tx) => {
    await run("UPDATE cohorts SET status = 'settling' WHERE status = 'active'", undefined, tx);
    await run(
      "INSERT OR IGNORE INTO cohorts (id, start_date, end_date, status) VALUES (@id, @start_date, @end_date, 'active')",
      { id: cohortId, start_date: startDate, end_date: endDate },
      tx
    );
    const models = await queryAll<ModelRow>("SELECT * FROM models", undefined, tx);
    for (const model of models) {
      await run(
        "INSERT OR IGNORE INTO cohort_models (cohort_id, model_id, bankroll) VALUES (@cohort_id, @model_id, 10000)",
        { cohort_id: cohortId, model_id: model.id },
        tx
      );
    }
  });

  return (await queryOne<CohortRow>("SELECT * FROM cohorts WHERE id = @id", { id: cohortId }))!;
}

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Budget check -- refuse to run if over $100 cap
    if (!(await canAffordRound())) {
      const spent = await getTotalSpent();
      const cap = getBudgetCap();
      return NextResponse.json({
        skipped: true,
        reason: `Budget exhausted. Spent $${spent.toFixed(2)} of $${cap.toFixed(2)} cap.`,
      });
    }

    const activeCohort = await ensureActiveCohort();

    // Always re-sync markets to get fresh prices
    await syncMarkets();

    const result = await runRound(activeCohort.id);

    const roundCost = result.bets.reduce((s, b) => s + b.api_cost, 0);

    return NextResponse.json({
      success: true,
      round_id: result.roundId,
      bets: result.bets.length,
      round_cost: roundCost,
      total_spent: await getTotalSpent(),
      budget_remaining: getBudgetCap() - (await getTotalSpent()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
