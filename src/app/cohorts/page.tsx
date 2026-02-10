import { CohortTimeline } from "@/components/cohort-timeline";
import type { CohortRow } from "@/lib/schemas";

async function fetchCohorts(): Promise<CohortRow[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/cohorts`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function CohortsPage() {
  const cohorts = await fetchCohorts();

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
