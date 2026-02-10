import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODEL_COLORS, MODEL_LIST } from "@/lib/models";
import { fmtDollars, fmtBrier } from "@/lib/format";
import type { BetRow } from "@/lib/schemas";

interface BetComparisonProps {
  bets: BetRow[];
}

function actionBadge(action: string) {
  switch (action) {
    case "bet_yes":
      return <Badge className="bg-emerald-500/20 text-emerald-400">YES</Badge>;
    case "bet_no":
      return <Badge className="bg-red-500/20 text-red-400">NO</Badge>;
    default:
      return <Badge variant="secondary">PASS</Badge>;
  }
}

export function BetComparison({ bets }: BetComparisonProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {MODEL_LIST.map((model) => {
        const bet = bets.find((b) => b.model_id === model.id);
        const colors = MODEL_COLORS[model.id];

        return (
          <Card
            key={model.id}
            style={{ borderTopColor: colors.primary, borderTopWidth: 3 }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{model.emoji}</span>
                <span className={`text-sm font-semibold ${colors.text}`}>{model.name}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!bet ? (
                <p className="text-muted-foreground text-xs">No prediction</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    {actionBadge(bet.action)}
                    {bet.confidence != null && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {Math.round(bet.confidence * 100)}% conf
                      </span>
                    )}
                  </div>

                  {bet.confidence != null && (
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(bet.confidence * 100)}%`,
                          backgroundColor: colors.primary,
                        }}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {bet.bet_amount != null && (
                      <div>
                        <p className="text-muted-foreground">Bet</p>
                        <p className="font-mono">{fmtDollars(bet.bet_amount)}</p>
                      </div>
                    )}
                    {bet.estimated_probability != null && (
                      <div>
                        <p className="text-muted-foreground">Est. Prob</p>
                        <p className="font-mono">{Math.round(bet.estimated_probability * 100)}%</p>
                      </div>
                    )}
                    {bet.market_price_at_bet != null && (
                      <div>
                        <p className="text-muted-foreground">Mkt Price</p>
                        <p className="font-mono">{Math.round(bet.market_price_at_bet * 100)}c</p>
                      </div>
                    )}
                    {bet.settled === 1 && (
                      <div>
                        <p className="text-muted-foreground">P&L</p>
                        <p className={`font-mono font-semibold ${bet.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {bet.pnl >= 0 ? "+" : ""}{fmtDollars(bet.pnl)}
                        </p>
                      </div>
                    )}
                  </div>

                  {bet.settled === 1 && bet.brier_score != null && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Brier: </span>
                      <span className="font-mono">{fmtBrier(bet.brier_score)}</span>
                    </div>
                  )}

                  {bet.reasoning && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                      {bet.reasoning}
                    </p>
                  )}

                  {bet.key_factors && (
                    <div className="flex flex-wrap gap-1">
                      {JSON.parse(bet.key_factors).slice(0, 3).map((f: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] font-normal">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
