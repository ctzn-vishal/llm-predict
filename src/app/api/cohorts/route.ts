import { NextResponse } from "next/server";
import { queryAll, queryOne } from "@/lib/db";
import type { CohortRow } from "@/lib/schemas";
import { createWeeklyCohort } from "@/lib/cohort";

export async function POST() {
  try {
    const result = await createWeeklyCohort();
    if (!result.created) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    const cohort = await queryOne<CohortRow>(
      "SELECT * FROM cohorts WHERE id = @id",
      { id: result.cohortId },
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
      "SELECT * FROM cohorts ORDER BY start_date DESC",
    );
    return NextResponse.json(cohorts);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
