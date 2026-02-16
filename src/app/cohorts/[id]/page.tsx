import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { RoundFeed } from "@/components/round-feed";
import { PortfolioChart } from "@/components/portfolio-chart";
import { fmtDateShort } from "@/lib/format";
import type { CohortRow, ModelStats, RoundRow } from "@/lib/schemas";

interface CohortDetailData {
  cohort: CohortRow | null;
  leaderboard: ModelStats[];
  rounds: RoundRow[];
  timeline: { date: string;[key: string]: number | string }[];
}

async function fetchCohortDetail(id: string): Promise<CohortDetailData> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/cohorts/${id}`, { cache: "no-store" });
    if (!res.ok) return { cohort: null, leaderboard: [], rounds: [], timeline: [] };
    const data = await res.json();
    return {
      cohort: data.cohort ?? null,
      leaderboard: data.leaderboard ?? [],
      rounds: data.rounds ?? [],
      timeline: data.timeline ?? [],
    };
  } catch {
    return { cohort: null, leaderboard: [], rounds: [], timeline: [] };
  }
}

export default async function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { cohort, leaderboard, rounds, timeline } = await fetchCohortDetail(id);

  if (!cohort) {
    return (
      <div className="space-y-4">
        <Link href="/cohorts" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to cohorts
        </Link>
        <p className="text-muted-foreground py-8 text-center">Cohort not found.</p>
      </div>
    );
  }

  const isActive = cohort.status === "active";

  const chartModels = leaderboard.map(m => ({
    id: m.model_id,
    name: m.display_name,
    color: m.color
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/cohorts" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to cohorts
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {fmtDateShort(cohort.start_date)} - {fmtDateShort(cohort.end_date)}
          </h1>
          <Badge
            className={
              isActive
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-muted text-muted-foreground"
            }
          >
            {cohort.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {cohort.market_count} markets | ID: {cohort.id.slice(0, 8)}
        </p>
      </div>

      <div className="h-[400px]">
        <PortfolioChart data={timeline} models={chartModels} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Leaderboard</h2>
        <LeaderboardTable data={leaderboard} />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Rounds</h2>
        <RoundFeed rounds={rounds} />
      </div>
    </div>
  );
}

