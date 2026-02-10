import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import type { RoundRow } from "@/lib/schemas";

interface RoundFeedProps {
  rounds: RoundRow[];
}

export function RoundFeed({ rounds }: RoundFeedProps) {
  if (rounds.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No rounds yet. Start one from the Arena.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rounds.map((round) => {
        const marketCount = round.market_ids
          ? JSON.parse(round.market_ids).length
          : 0;
        return (
          <Link
            key={round.id}
            href={`/rounds/${round.id}`}
            className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-accent/30"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">
                {round.id.slice(0, 8)}
              </span>
              <span className="text-sm">{fmtDate(round.created_at)}</span>
              <Badge variant="secondary" className="text-[10px]">
                {marketCount} market{marketCount !== 1 ? "s" : ""}
              </Badge>
            </div>
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
          </Link>
        );
      })}
    </div>
  );
}
