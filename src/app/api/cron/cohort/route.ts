import { NextRequest, NextResponse } from "next/server";
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from "date-fns";
import { queryAll, queryOne, run, transaction } from "@/lib/db";
import type { CohortRow, ModelRow } from "@/lib/schemas";
import { canAffordRound, getTotalSpent, getBudgetCap } from "@/lib/cost-tracker";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Don't create new cohort if budget is exhausted
    if (!(await canAffordRound())) {
      return NextResponse.json({
        skipped: true,
        reason: `Budget exhausted. Spent $${(await getTotalSpent()).toFixed(2)} of $${getBudgetCap().toFixed(2)} cap.`,
      });
    }

    const now = new Date();
    const weekNum = getISOWeek(now);
    const weekYear = getISOWeekYear(now);
    const cohortId = `${weekYear}-W${String(weekNum).padStart(2, "0")}`;

    // Check if already exists
    const existing = await queryOne<CohortRow>("SELECT * FROM cohorts WHERE id = @id", { id: cohortId });
    if (existing) {
      return NextResponse.json({ skipped: true, reason: `Cohort ${cohortId} already exists` });
    }

    const startDate = startOfISOWeek(now).toISOString();
    const endDate = endOfISOWeek(now).toISOString();

    await transaction(async (tx) => {
      await run("UPDATE cohorts SET status = 'settling' WHERE status = 'active'", undefined, tx);
      await run(
        "INSERT INTO cohorts (id, start_date, end_date, status) VALUES (@id, @start_date, @end_date, 'active')",
        { id: cohortId, start_date: startDate, end_date: endDate },
        tx
      );
      const models = await queryAll<ModelRow>("SELECT * FROM models", undefined, tx);
      for (const model of models) {
        await run(
          "INSERT INTO cohort_models (cohort_id, model_id, bankroll) VALUES (@cohort_id, @model_id, 10000)",
          { cohort_id: cohortId, model_id: model.id },
          tx
        );
      }
    });

    return NextResponse.json({ success: true, cohort_id: cohortId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
