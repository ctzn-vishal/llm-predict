import { NextResponse } from "next/server";
import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from "date-fns";
import { queryAll, queryOne, run, transaction } from "@/lib/db";
import type { CohortRow, ModelRow } from "@/lib/schemas";

export async function POST() {
  try {
    const now = new Date();
    const weekNum = getISOWeek(now);
    const weekYear = getISOWeekYear(now);
    const cohortId = `${weekYear}-W${String(weekNum).padStart(2, "0")}`;

    // Check if this cohort already exists
    const existing = await queryOne<CohortRow>(
      "SELECT * FROM cohorts WHERE id = @id",
      { id: cohortId }
    );
    if (existing) {
      return NextResponse.json(
        { error: `Cohort ${cohortId} already exists` },
        { status: 409 }
      );
    }

    const startDate = startOfISOWeek(now).toISOString();
    const endDate = endOfISOWeek(now).toISOString();

    await transaction(async (tx) => {
      // Mark any previous active cohort as 'completed'
      await run("UPDATE cohorts SET status = 'completed' WHERE status = 'active'", undefined, tx);

      // Create new cohort
      await run(
        "INSERT INTO cohorts (id, start_date, end_date, status) VALUES (@id, @start_date, @end_date, 'active')",
        { id: cohortId, start_date: startDate, end_date: endDate },
        tx
      );

      // Create cohort_models for each model (6 LLMs + ensemble) with bankroll=10000
      const models = await queryAll<ModelRow>("SELECT * FROM models", undefined, tx);
      for (const model of models) {
        await run(
          "INSERT INTO cohort_models (cohort_id, model_id, bankroll) VALUES (@cohort_id, @model_id, 10000)",
          { cohort_id: cohortId, model_id: model.id },
          tx
        );
      }
    });

    const cohort = await queryOne<CohortRow>(
      "SELECT * FROM cohorts WHERE id = @id",
      { id: cohortId }
    );

    return NextResponse.json(cohort, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cohorts = await queryAll<CohortRow>(
      "SELECT * FROM cohorts ORDER BY start_date DESC"
    );
    return NextResponse.json(cohorts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
