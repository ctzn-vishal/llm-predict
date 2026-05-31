import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ForecastComparison, type RoundForecast } from "@/components/forecast-comparison";
import { fmtDate, fmtProb } from "@/lib/format";
import { queryAll, queryOne } from "@/lib/db";
import type { RoundRow } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface RoundForecastRow extends RoundForecast {
  market_id: string;
  question: string;
  market_yes_price: number | null;
  market_resolved: number;
}

async function fetchRound(id: string): Promise<{
  round: RoundRow | null;
  forecasts: RoundForecastRow[];
}> {
  try {
    const round = await queryOne<RoundRow>("SELECT * FROM rounds WHERE id = @id", { id });
    if (!round) return { round: null, forecasts: [] };
    const forecasts = await queryAll<RoundForecastRow>(
      `SELECT
        f.forecaster_id, f.forecaster_kind, f.market_id,
        f.prob_yes, f.reasoning, f.key_factors, f.crowd_price,
        f.ok, f.error, f.brier, f.outcome,
        m.display_name, m.avatar_emoji, m.color,
        mk.question, mk.yes_price AS market_yes_price, mk.resolved AS market_resolved
      FROM forecasts f
      JOIN models m ON m.id = f.forecaster_id
      JOIN markets mk ON mk.id = f.market_id
      WHERE f.round_id = @id
      ORDER BY mk.question, m.display_name`,
      { id },
    );
    return { round, forecasts };
  } catch (error) {
    console.error("Error fetching round:", error);
    return { round: null, forecasts: [] };
  }
}

function resolvedBadge(resolved: number) {
  if (resolved === 1 || resolved === 2)
    return <Badge className="shrink-0 bg-emerald-500/20 text-emerald-400">Resolved</Badge>;
  if (resolved === 3)
    return <Badge variant="secondary" className="shrink-0">Voided</Badge>;
  return <Badge variant="secondary" className="shrink-0">Open</Badge>;
}

export default async function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { round, forecasts } = await fetchRound(id);

  if (!round) {
    return (
      <div className="space-y-4">
        <Link href="/rounds" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to rounds
        </Link>
        <p className="py-8 text-center text-muted-foreground">Round not found.</p>
      </div>
    );
  }

  // Group forecasts by market, preserving query order.
  const byMarket = new Map<string, RoundForecastRow[]>();
  for (const f of forecasts) {
    const arr = byMarket.get(f.market_id) ?? [];
    arr.push(f);
    byMarket.set(f.market_id, arr);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/rounds" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to rounds
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Round {round.id.slice(0, 8)}</h1>
          <Badge
            className={
              round.status === "completed"
                ? "bg-emerald-500/20 text-emerald-400"
                : round.status === "in_progress"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-muted text-muted-foreground"
            }
          >
            {round.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtDate(round.created_at)} · {byMarket.size} market{byMarket.size !== 1 ? "s" : ""} ·
          Cohort {round.cohort_id}
        </p>
      </div>

      {byMarket.size === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No forecasts recorded for this round.
        </p>
      ) : (
        <div className="space-y-10">
          {[...byMarket.entries()].map(([marketId, rows]) => {
            const first = rows[0];
            return (
              <div key={marketId} className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium leading-snug">
                        {first.question}
                      </CardTitle>
                      {resolvedBadge(first.market_resolved)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        Crowd at forecast:{" "}
                        <span className="font-mono text-foreground">
                          {first.crowd_price != null ? fmtProb(first.crowd_price) : "—"}
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <ForecastComparison forecasts={rows} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
