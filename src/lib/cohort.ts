import {
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  endOfISOWeek,
} from "date-fns";
import { queryOne, run, transaction } from "./db";
import type { CohortRow } from "./schemas";

// Cohorts are weekly competition windows (ISO week, e.g. "2026-W22"). There is
// no bankroll anymore -- a cohort is just a date-bounded grouping of rounds.

export function currentCohortId(now = new Date()): string {
  const weekNum = getISOWeek(now);
  const weekYear = getISOWeekYear(now);
  return `${weekYear}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Return the active cohort, creating one for the current ISO week if none is
 * active. Older active cohorts roll into 'settling' so their forecasts can
 * still be scored as their markets resolve.
 */
export async function ensureActiveCohort(now = new Date()): Promise<CohortRow> {
  const existing = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE status = 'active' LIMIT 1",
  );
  if (existing) return existing;

  const id = currentCohortId(now);
  const startDate = startOfISOWeek(now).toISOString();
  const endDate = endOfISOWeek(now).toISOString();

  await transaction(async (tx) => {
    await run(
      "UPDATE cohorts SET status = 'settling' WHERE status = 'active' AND id != @id",
      { id },
      tx,
    );
    await run(
      `INSERT INTO cohorts (id, start_date, end_date, status)
       VALUES (@id, @start_date, @end_date, 'active')
       ON CONFLICT(id) DO UPDATE SET status = 'active'`,
      { id, start_date: startDate, end_date: endDate },
      tx,
    );
  });

  return (await queryOne<CohortRow>("SELECT * FROM cohorts WHERE id = @id", {
    id,
  }))!;
}

export interface CreateCohortResult {
  created: boolean;
  cohortId: string;
  reason?: string;
}

/**
 * Create the current-week cohort, rolling the previous active cohort into
 * 'settling'. No-op (created=false) if this week's cohort already exists.
 */
export async function createWeeklyCohort(
  now = new Date(),
): Promise<CreateCohortResult> {
  const id = currentCohortId(now);
  const existing = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE id = @id",
    { id },
  );
  if (existing) {
    return { created: false, cohortId: id, reason: `Cohort ${id} already exists` };
  }

  const startDate = startOfISOWeek(now).toISOString();
  const endDate = endOfISOWeek(now).toISOString();

  await transaction(async (tx) => {
    await run(
      "UPDATE cohorts SET status = 'settling' WHERE status = 'active'",
      undefined,
      tx,
    );
    await run(
      "INSERT INTO cohorts (id, start_date, end_date, status) VALUES (@id, @start_date, @end_date, 'active')",
      { id, start_date: startDate, end_date: endDate },
      tx,
    );
  });

  return { created: true, cohortId: id };
}
