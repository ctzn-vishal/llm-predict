import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { RoundFeed } from "@/components/round-feed";
import { fmtDateShort, fmtBrier } from "@/lib/format";
import { getLeaderboard, getEnsembleComparison } from "@/lib/scoring";
import { queryAll, queryOne } from "@/lib/db";
import type { CohortRow, RoundRow } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function fetchCohort(id: string) {
  try {
    const cohort = await queryOne<CohortRow>("SELECT * FROM cohorts WHERE id = @id", { id });
    if (!cohort) return null;
    const [leaderboard, comparison, rounds] = await Promise.all([
      getLeaderboard(id),
      getEnsembleComparison(id),
      queryAll<RoundRow>(
        "SELECT * FROM rounds WHERE cohort_id = @id ORDER BY created_at DESC",
        { id },
      ),
    ]);
    return { cohort, leaderboard, comparison, rounds };
  } catch (error) {
    console.error("Error fetching cohort:", error);
    return null;
  }
}

export default async function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchCohort(id);

  if (!data) {
    return (
      <div className="space-y-4">
        <Link href="/cohorts" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to cohorts
        </Link>
        <p className="py-8 text-center text-muted-foreground">Cohort not found.</p>
      </div>
    );
  }

  const { cohort, leaderboard, comparison, rounds } = data;
  const isActive = cohort.status === "active";
  const hasData = comparison.nMarkets > 0;
  const ensembleSkill = comparison.crowdBrier - comparison.ensembleBrier;
  const ensembleWins = ensembleSkill > 0;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/cohorts" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to cohorts
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {fmtDateShort(cohort.start_date)} – {fmtDateShort(cohort.end_date)}
          </h1>
          <Badge
            className={
              isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"
            }
          >
            {cohort.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {cohort.market_count} markets · {cohort.id}
        </p>
      </div>

      {hasData && (
        <Card className={ensembleWins ? "border-emerald-500/40" : "border-amber-500/40"}>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-bold">
              {ensembleWins ? (
                <>
                  The <span className="text-amber-400">ensemble</span> beat the{" "}
                  <span className="text-slate-300">crowd</span> this cohort
                </>
              ) : (
                <>
                  The <span className="text-slate-300">crowd</span> held off the{" "}
                  <span className="text-amber-400">ensemble</span> this cohort
                </>
              )}
            </p>
            <div className="flex gap-6 font-mono text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Ensemble</p>
                <p className="text-lg font-semibold text-amber-400">{fmtBrier(comparison.ensembleBrier)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Crowd</p>
                <p className="text-lg font-semibold text-slate-300">{fmtBrier(comparison.crowdBrier)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Markets</p>
                <p className="text-lg font-semibold">{comparison.nMarkets}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold">Skill leaderboard</h2>
        <LeaderboardTable data={leaderboard} />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Rounds</h2>
        <RoundFeed rounds={rounds} />
      </div>
    </div>
  );
}
