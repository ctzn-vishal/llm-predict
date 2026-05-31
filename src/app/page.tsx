import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { SkillVsCrowdChart } from "@/components/skill-vs-crowd-chart";
import { Trophy, Target, Users, CheckCircle2, ArrowRight } from "lucide-react";
import { getLeaderboard, getEnsembleComparison } from "@/lib/scoring";
import { queryOne } from "@/lib/db";
import { fmtBrier, fmtSkill } from "@/lib/format";
import type { ForecasterStats, EnsembleComparison } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface HomeData {
  leaderboard: ForecasterStats[];
  comparison: EnsembleComparison;
  activeMarkets: number;
  resolvedMarkets: number;
}

const EMPTY_COMPARISON: EnsembleComparison = {
  ensembleBrier: 0,
  meanIndividualBrier: 0,
  bestIndividualBrier: 0,
  bestIndividualId: "",
  crowdBrier: 0,
  nMarkets: 0,
};

async function fetchHome(): Promise<HomeData> {
  try {
    const [leaderboard, comparison] = await Promise.all([
      getLeaderboard(),
      getEnsembleComparison(),
    ]);
    const summary = await queryOne<{
      active_market_count: number;
      resolved_market_count: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM markets WHERE resolved = 0) AS active_market_count,
        (SELECT COUNT(*) FROM markets WHERE resolved IN (1, 2)) AS resolved_market_count`,
    );
    return {
      leaderboard,
      comparison,
      activeMarkets: summary?.active_market_count ?? 0,
      resolvedMarkets: summary?.resolved_market_count ?? 0,
    };
  } catch (error) {
    console.error("Error loading home page:", error);
    return { leaderboard: [], comparison: EMPTY_COMPARISON, activeMarkets: 0, resolvedMarkets: 0 };
  }
}

export default async function HomePage() {
  const { leaderboard, comparison, activeMarkets, resolvedMarkets } = await fetchHome();

  const hasData = leaderboard.some((f) => f.n_resolved > 0);
  const ensembleSkill = comparison.crowdBrier - comparison.ensembleBrier; // >0 → ensemble beats crowd
  const ensembleWins = ensembleSkill > 0;

  const models = leaderboard.filter((f) => f.kind === "model");
  const totalModels = models.length || 6;
  const modelsBeatingCrowd = models.filter(
    (f) => f.n_resolved > 0 && f.skill_vs_crowd > 0,
  ).length;

  const best = leaderboard
    .filter((f) => f.kind !== "crowd" && f.n_resolved > 0)
    .sort((a, b) => b.skill_vs_crowd - a.skill_vs_crowd)[0];

  const heroCards = [
    {
      label: "Best vs. Crowd",
      value: best ? `${best.avatar_emoji} ${best.display_name}` : "—",
      sub: best ? `${fmtSkill(best.skill_vs_crowd)} Brier` : "awaiting data",
      icon: Trophy,
    },
    {
      label: "Ensemble Skill",
      value: hasData ? fmtSkill(ensembleSkill) : "—",
      sub: "Brier vs. crowd",
      icon: Target,
    },
    {
      label: "Models Beating Crowd",
      value: hasData ? `${modelsBeatingCrowd} / ${totalModels}` : `0 / ${totalModels}`,
      sub: "on shared markets",
      icon: Users,
    },
    {
      label: "Markets Resolved",
      value: resolvedMarkets.toLocaleString(),
      sub: `${activeMarkets} still open`,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Can AI beat the crowd?</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Six LLMs make <span className="text-foreground">blind</span> probability forecasts on
          live prediction markets — they never see the market price. We score each against the
          crowd (the market price itself) and test whether pooling them into an ensemble wins.
        </p>
      </div>

      {/* Headline verdict */}
      {hasData ? (
        <Card className={ensembleWins ? "border-emerald-500/40" : "border-amber-500/40"}>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                The verdict so far
              </p>
              <p className="mt-1 text-xl font-bold">
                {ensembleWins ? (
                  <>
                    Yes — the <span className="text-amber-400">ensemble</span> beats the{" "}
                    <span className="text-slate-300">crowd</span>
                  </>
                ) : (
                  <>
                    Not yet — the <span className="text-slate-300">crowd</span> still leads the{" "}
                    <span className="text-amber-400">ensemble</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-6 font-mono text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Ensemble Brier</p>
                <p className="text-lg font-semibold text-amber-400">{fmtBrier(comparison.ensembleBrier)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Crowd Brier</p>
                <p className="text-lg font-semibold text-slate-300">{fmtBrier(comparison.crowdBrier)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Markets</p>
                <p className="text-lg font-semibold">{comparison.nMarkets}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-2 p-5">
            <p className="text-sm font-medium">No resolved forecasts yet.</p>
            <p className="text-sm text-muted-foreground">
              Run a round in the Arena to collect blind forecasts, then wait for the short-horizon
              markets to settle. The leaderboard and ensemble verdict fill in automatically.
            </p>
            <Link
              href="/arena"
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Go to the Arena <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {heroCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                <card.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="truncate text-lg font-bold">{card.value}</p>
                <p className="text-[11px] text-muted-foreground">{card.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <SkillVsCrowdChart data={leaderboard} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Skill leaderboard</h2>
          <Link
            href="/analysis"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Why the ensemble wins <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <LeaderboardTable data={leaderboard} />
        <p className="text-xs text-muted-foreground">
          Sorted by skill vs. the crowd. Lower Brier, log loss, and ECE are better; higher
          resolution means more informative forecasts. Reliability is the share of valid
          (non-errored) forecasts.
        </p>
      </div>
    </div>
  );
}
