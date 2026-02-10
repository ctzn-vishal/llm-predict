import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort } from "@/lib/format";
import type { MarketRow } from "@/lib/schemas";

interface MarketCardProps {
  market: MarketRow;
}

export function MarketCard({ market }: MarketCardProps) {
  const yesPrice = market.yes_price ?? 0.5;
  const noPrice = market.no_price ?? 0.5;
  const yesPct = Math.round(yesPrice * 100);
  const noPct = Math.round(noPrice * 100);

  return (
    <Card className="transition-colors hover:bg-accent/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-snug line-clamp-2">
            {market.question}
          </CardTitle>
          {market.resolved ? (
            <Badge className="shrink-0 bg-emerald-500/20 text-emerald-400">Resolved</Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">Open</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-emerald-400">YES {yesPct}c</span>
            <span className="text-red-400">NO {noPct}c</span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-red-500/30">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${yesPct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {market.volume_24h != null && (
            <span>Vol: ${Math.round(market.volume_24h).toLocaleString()}</span>
          )}
          {market.end_date && (
            <span>Ends {fmtDateShort(market.end_date)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
