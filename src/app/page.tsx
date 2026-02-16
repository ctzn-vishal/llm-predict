import { Card, CardContent } from "@/components/ui/card";
import { LeaderboardTabs } from "@/components/leaderboard-tabs";
import { MODEL_LIST } from "@/lib/models";
import type { ModelStats } from "@/lib/schemas";
import { Trophy, Layers, TrendingUp, BarChart3 } from "lucide-react";
import { getLeaderboard } from "@/lib/scoring";
import { queryOne } from "@/lib/db";

const PLACEHOLDER_STATS: ModelStats[] = MODEL_LIST.map((m) => ({
  model_id: m.id,
  display_name: m.name,
  provider: m.provider,
  avatar_emoji: m.emoji,
  color: "",
  bankroll: 10000,
  total_pnl: 0,
  roi_pct: 0,
  brier_score: 0,
  total_bets: 0,
  win_rate: 0,
  pass_rate: 0,
  avg_confidence: 0,
  avg_bet_size: 0,
  total_api_cost: 0,
  avg_difficulty: 0,
  resolved_bets: 0,
  initial_bankroll: 10000,
}));

async function fetchLeaderboard(): Promise<{
  current: ModelStats[];
  allTime: ModelStats[];
  cohort_count: number;
  active_market_count: number;
}> {
  try {
    const leaderboard = await getLeaderboard();

    // Fetch summary stats
    const summaryRow = await queryOne<{
      cohort_count: number;
      active_market_count: number;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM cohorts) AS cohort_count,
        (SELECT COUNT(*) FROM markets WHERE resolved = 0) AS active_market_count`
    );

    const stats = leaderboard.length > 0 ? leaderboard : PLACEHOLDER_STATS;

    return {
      current: stats,
      allTime: stats,
      cohort_count: summaryRow?.cohort_count ?? 0,
      active_market_count: summaryRow?.active_market_count ?? 0,
    };
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return { current: PLACEHOLDER_STATS, allTime: PLACEHOLDER_STATS, cohort_count: 0, active_market_count: 0 };
  }
}

export default async function HomePage() {
  const { current, allTime, cohort_count, active_market_count } = await fetchLeaderboard();
  const stats = allTime.length > 0 ? allTime : PLACEHOLDER_STATS;

  const topModel = [...stats].sort((a, b) => b.roi_pct - a.roi_pct)[0];
  const totalBets = stats.reduce((s, m) => s + m.total_bets, 0);

  const heroCards = [
    {
      label: "Top Model",
      value: topModel ? `${topModel.avatar_emoji} ${topModel.display_name}` : "--",
      icon: Trophy,
    },
    { label: "Cohorts", value: cohort_count > 0 ? cohort_count.toLocaleString() : "--", icon: Layers },
    { label: "Active Markets", value: active_market_count > 0 ? active_market_count.toLocaleString() : "--", icon: TrendingUp },
    { label: "Total Bets", value: totalBets.toLocaleString(), icon: BarChart3 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          7 models competing on real Polymarket prediction markets
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {heroCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                <card.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-lg font-bold font-mono">{card.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <LeaderboardTabs
        current={current.length > 0 ? current : PLACEHOLDER_STATS}
        allTime={allTime.length > 0 ? allTime : PLACEHOLDER_STATS}
      />
    </div>
  );
}
