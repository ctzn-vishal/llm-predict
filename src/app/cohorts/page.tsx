import { CohortTimeline } from "@/components/cohort-timeline";
import { queryAll } from "@/lib/db";
import type { CohortRow } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function getCohorts(): Promise<CohortRow[]> {
  const cohorts = await queryAll<CohortRow>(
    "SELECT * FROM cohorts ORDER BY start_date DESC"
  );
  return cohorts;
}

export default async function CohortsPage() {
  const cohorts = await getCohorts();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cohorts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weekly competition periods with fresh bankrolls and market selections
        </p>
      </div>
      <CohortTimeline cohorts={cohorts} />
    </div>
  );
}
