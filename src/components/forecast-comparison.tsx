import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtProb, fmtBrier } from "@/lib/format";

export interface RoundForecast {
  forecaster_id: string;
  forecaster_kind: string;
  prob_yes: number | null;
  reasoning: string | null;
  key_factors: string | null;
  crowd_price: number | null;
  ok: number;
  error: string | null;
  brier: number | null;
  outcome: number | null;
  display_name: string;
  avatar_emoji: string;
  color: string;
}

interface ForecastComparisonProps {
  forecasts: RoundForecast[];
}

// For a single market: each model's blind P(YES) alongside the crowd price and,
// once settled, who actually beat the crowd.
export function ForecastComparison({ forecasts }: ForecastComparisonProps) {
  const crowd = forecasts.find((f) => f.forecaster_kind === "crowd");
  const competitors = forecasts
    .filter((f) => f.forecaster_kind !== "crowd")
    .sort((a, b) => (a.forecaster_kind === "ensemble" ? 1 : 0) - (b.forecaster_kind === "ensemble" ? 1 : 0));

  const crowdBrier = crowd?.brier ?? null;
  const outcome = forecasts.find((f) => f.outcome != null)?.outcome ?? null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {competitors.map((f) => {
        const failed = f.ok === 0;
        const beatCrowd =
          f.brier != null && crowdBrier != null ? f.brier < crowdBrier : null;
        let factors: string[] = [];
        if (f.key_factors) {
          try {
            factors = JSON.parse(f.key_factors);
          } catch {
            factors = [];
          }
        }

        return (
          <Card key={f.forecaster_id} style={{ borderTopColor: f.color, borderTopWidth: 3 }}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="text-lg">{f.avatar_emoji}</span>
                  <span className="text-sm font-semibold" style={{ color: f.color }}>
                    {f.display_name}
                  </span>
                </span>
                {beatCrowd !== null && (
                  <Badge
                    variant="outline"
                    className={
                      beatCrowd
                        ? "border-emerald-500/40 text-[10px] text-emerald-400"
                        : "border-red-500/40 text-[10px] text-red-400"
                    }
                  >
                    {beatCrowd ? "beat crowd" : "lost"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {failed ? (
                <div className="space-y-1">
                  <Badge variant="outline" className="border-red-500/40 text-red-400">
                    no forecast
                  </Badge>
                  {f.error && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{f.error}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-2xl font-bold">
                      {f.prob_yes != null ? fmtProb(f.prob_yes) : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">P(YES)</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((f.prob_yes ?? 0) * 100)}%`,
                        backgroundColor: f.color,
                      }}
                    />
                  </div>
                  {f.brier != null && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Brier: </span>
                      <span className="font-mono">{fmtBrier(f.brier)}</span>
                    </div>
                  )}
                  {factors.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {factors.slice(0, 3).map((k, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                          {k}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {f.reasoning && (
                    <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                      {f.reasoning}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {crowd && (
        <Card className="border-dashed bg-muted/20" style={{ borderTopColor: crowd.color, borderTopWidth: 3 }}>
          <CardHeader className="pb-2">
            <span className="flex items-center gap-2">
              <span className="text-lg">{crowd.avatar_emoji}</span>
              <span className="text-sm font-semibold text-slate-300">{crowd.display_name}</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                baseline
              </Badge>
            </span>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold">
                {crowd.prob_yes != null ? fmtProb(crowd.prob_yes) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">market price</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-slate-400"
                style={{ width: `${Math.round((crowd.prob_yes ?? 0) * 100)}%` }}
              />
            </div>
            {outcome != null && (
              <div className="text-xs">
                <span className="text-muted-foreground">Resolved: </span>
                <span className={outcome === 1 ? "text-emerald-400" : "text-red-400"}>
                  {outcome === 1 ? "YES" : "NO"}
                </span>
              </div>
            )}
            {crowd.brier != null && (
              <div className="text-xs">
                <span className="text-muted-foreground">Brier: </span>
                <span className="font-mono">{fmtBrier(crowd.brier)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
