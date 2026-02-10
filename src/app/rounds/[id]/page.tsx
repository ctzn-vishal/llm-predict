import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BetComparison } from "@/components/bet-comparison";
import { fmtDate } from "@/lib/format";
import type { RoundRow, BetRow, MarketRow } from "@/lib/schemas";

interface RoundDetailData {
  round: RoundRow | null;
  bets: BetRow[];
  markets: MarketRow[];
}

async function fetchRoundDetail(id: string): Promise<RoundDetailData> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/rounds/${id}`, { cache: "no-store" });
    if (!res.ok) return { round: null, bets: [], markets: [] };
    const data = await res.json();
    return {
      round: data.round ?? null,
      bets: data.bets ?? [],
      markets: data.markets ?? [],
    };
  } catch {
    return { round: null, bets: [], markets: [] };
  }
}

export default async function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { round, bets, markets } = await fetchRoundDetail(id);

  if (!round) {
    return (
      <div className="space-y-4">
        <Link href="/rounds" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to rounds
        </Link>
        <p className="text-muted-foreground py-8 text-center">Round not found.</p>
      </div>
    );
  }

  const marketIds: string[] = round.market_ids ? JSON.parse(round.market_ids) : [];
  const betsByMarket = new Map<string, BetRow[]>();
  for (const bet of bets) {
    const arr = betsByMarket.get(bet.market_id) ?? [];
    arr.push(bet);
    betsByMarket.set(bet.market_id, arr);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/rounds" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to rounds
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Round {round.id.slice(0, 8)}
          </h1>
          <Badge
            className={
              round.status === "completed"
                ? "bg-emerald-500/20 text-emerald-400"
                : round.status === "running"
                ? "bg-yellow-500/20 text-yellow-400"
                : "bg-muted text-muted-foreground"
            }
          >
            {round.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {fmtDate(round.created_at)} | {marketIds.length} market{marketIds.length !== 1 ? "s" : ""} | Cohort {round.cohort_id.slice(0, 8)}
        </p>
      </div>

      {marketIds.length === 0 && bets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No market data for this round.
        </p>
      ) : (
        <div className="space-y-10">
          {marketIds.map((marketId) => {
            const market = markets.find((m) => m.id === marketId);
            const marketBets = betsByMarket.get(marketId) ?? [];

            return (
              <div key={marketId} className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium leading-snug">
                        {market?.question ?? `Market ${marketId.slice(0, 8)}`}
                      </CardTitle>
                      {market?.resolved ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 shrink-0">Resolved</Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0">Open</Badge>
                      )}
                    </div>
                  </CardHeader>
                  {market && (
                    <CardContent>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>YES: {Math.round((market.yes_price ?? 0.5) * 100)}c</span>
                        <span>NO: {Math.round((market.no_price ?? 0.5) * 100)}c</span>
                        {market.volume_24h != null && (
                          <span>Vol: ${Math.round(market.volume_24h).toLocaleString()}</span>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>

                <BetComparison bets={marketBets} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
