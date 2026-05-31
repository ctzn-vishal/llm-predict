import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateShort } from "@/lib/format";
import type { CohortRow } from "@/lib/schemas";

interface CohortTimelineProps {
  cohorts: CohortRow[];
}

export function CohortTimeline({ cohorts }: CohortTimelineProps) {
  if (cohorts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No cohorts yet. The first cohort is created when you run a round.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cohorts.map((cohort) => {
        const isActive = cohort.status === "active";
        return (
          <Link key={cohort.id} href={`/cohorts/${cohort.id}`}>
            <Card className="h-full transition-colors hover:bg-accent/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {fmtDateShort(cohort.start_date)} – {fmtDateShort(cohort.end_date)}
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
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{cohort.market_count} markets</span>
                  <span className="font-mono">{cohort.id}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
