import { ModelCard } from "@/components/model-card";
import { MODEL_LIST } from "@/lib/models";
import type { ModelStats } from "@/lib/schemas";

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
}));

async function fetchLeaderboard(): Promise<ModelStats[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/leaderboard`, {
      cache: "no-store",
    });
    if (!res.ok) return PLACEHOLDER_STATS;
    const data = await res.json();
    const arr = data.allTime ?? data;
    return Array.isArray(arr) && arr.length > 0 ? arr : PLACEHOLDER_STATS;
  } catch {
    return PLACEHOLDER_STATS;
  }
}

export default async function ModelsPage() {
  const models = await fetchLeaderboard();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Models</h1>
        <p className="text-sm text-muted-foreground mt-1">
          6 frontier LLMs + 1 ensemble competing on prediction markets
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <ModelCard key={m.model_id} model={m} />
        ))}
      </div>
    </div>
  );
}
