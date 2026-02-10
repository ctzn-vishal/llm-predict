import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort, fmtDollars } from "@/lib/format";
import type { CohortRow, ModelStats } from "@/lib/schemas";

interface CohortTimelineProps {
  cohorts: CohortRow[];
  leaderboards?: Record<string, ModelStats[]>;
}

export function CohortTimeline({ cohorts, leaderboards }: CohortTimelineProps) {
  if (cohorts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No cohorts yet. The first cohort will be created when you run a round.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cohorts.map((cohort) => {
        const isActive = cohort.status === "active";
        const top3 = leaderboards?.[cohort.id]?.slice(0, 3) ?? [];

        return (
          <Link key={cohort.id} href={`/cohorts/${cohort.id}`}>
            <Card className="transition-colors hover:bg-accent/30 h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {fmtDateShort(cohort.start_date)} - {fmtDateShort(cohort.end_date)}
                  </CardTitle>
                  <Badge
                    className={
                      isActive
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {cohort.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{cohort.market_count} markets</span>
                  <span>ID: {cohort.id.slice(0, 8)}</span>
                </div>
                {top3.length > 0 && (
                  <div className="space-y-1">
                    {top3.map((m, i) => (
                      <div key={m.model_id} className="flex items-center justify-between text-xs">
                        <span>
                          {["🥇", "🥈", "🥉"][i]} {m.avatar_emoji} {m.display_name}
                        </span>
                        <span className={`font-mono ${m.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {m.total_pnl >= 0 ? "+" : ""}{fmtDollars(m.total_pnl)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
