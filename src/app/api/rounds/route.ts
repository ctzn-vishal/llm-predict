import { NextRequest, NextResponse } from "next/server";
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from "date-fns";
import { queryAll, queryOne, run, transaction } from "@/lib/db";
import type { CohortRow, ModelRow, RoundRow } from "@/lib/schemas";
import { runRound } from "@/lib/prediction";
import { syncMarkets } from "@/lib/polymarket";
import { canAffordRound, getTotalSpent, getBudgetCap } from "@/lib/cost-tracker";

export const maxDuration = 300;

async function ensureActiveCohort(): Promise<CohortRow> {
  let cohort = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE status = 'active' LIMIT 1"
  );
  if (cohort) return cohort;

  // Auto-create cohort for the current week
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

  cohort = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE id = @id",
    { id: cohortId }
  );
  return cohort!;
}

export async function POST() {
  try {
    // Budget check
    if (!(await canAffordRound())) {
      const spent = await getTotalSpent();
      const cap = getBudgetCap();
      return NextResponse.json(
        { error: `Budget exhausted. Spent $${spent.toFixed(2)} of $${cap.toFixed(2)} cap. No more rounds allowed.` },
        { status: 403 }
      );
    }

    // Ensure we have an active cohort (auto-create if needed)
    const activeCohort = await ensureActiveCohort();

    // Sync markets from Polymarket if we have none
    const marketCount = await queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM markets WHERE resolved = 0"
    );
    if (!marketCount || marketCount.cnt === 0) {
      await syncMarkets();
    }

    const result = await runRound(activeCohort.id);

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

    let rounds: RoundRow[];
    if (cohortId) {
      rounds = await queryAll<RoundRow>(
        "SELECT * FROM rounds WHERE cohort_id = @cohort_id ORDER BY created_at DESC",
        { cohort_id: cohortId }
      );
    } else {
      rounds = await queryAll<RoundRow>(
        "SELECT * FROM rounds ORDER BY created_at DESC"
      );
    }

    return NextResponse.json(rounds);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
