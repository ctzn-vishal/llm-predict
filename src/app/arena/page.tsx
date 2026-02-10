import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketCard } from "@/components/market-card";
import { ArenaControls } from "@/components/arena-controls";
import { CostDashboard } from "@/components/cost-chart";
import { fmtDateShort } from "@/lib/format";
import type { CohortRow, MarketRow } from "@/lib/schemas";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

async function fetchActiveCohort(): Promise<CohortRow | null> {
  try {
    const res = await fetch(`${BASE}/api/cohorts`, { cache: "no-store" });
    if (!res.ok) return null;
    const cohorts: CohortRow[] = await res.json();
    return cohorts.find((c) => c.status === "active") ?? cohorts[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchMarkets(): Promise<MarketRow[]> {
  try {
    const res = await fetch(`${BASE}/api/markets`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function fetchCosts() {
  try {
    const res = await fetch(`${BASE}/api/costs`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function ArenaPage() {
  const [cohort, markets, costs] = await Promise.all([
    fetchActiveCohort(),
    fetchMarkets(),
    fetchCosts(),
  ]);

  const now = new Date();
  const endDate = cohort ? new Date(cohort.end_date) : null;
  const daysRemaining = endDate
    ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000))
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Arena</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Automated prediction rounds run twice daily at 10:00 and 22:00 UTC.
          Settlement checks every 4 hours.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Cohort
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cohort ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400">
                    {cohort.status}
                  </Badge>
                  <span className="text-sm font-mono">{cohort.id}</span>
                  <span className="text-sm">
                    {fmtDateShort(cohort.start_date)} -{" "}
                    {fmtDateShort(cohort.end_date)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{cohort.market_count} markets</span>
                  {daysRemaining !== null && (
                    <span>{daysRemaining} days remaining</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active cohort. One will be auto-created on the next scheduled
                round.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Manual Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ArenaControls />
          </CardContent>
        </Card>
      </div>

      {/* Automation Schedule */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Automation Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                New Rounds
              </p>
              <p className="text-sm font-mono mt-1">10:00 & 22:00 UTC daily</p>
              <p className="text-xs text-muted-foreground mt-1">
                Syncs markets, runs 6 models on 10-15 markets
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Settlement
              </p>
              <p className="text-sm font-mono mt-1">Every 4 hours</p>
              <p className="text-xs text-muted-foreground mt-1">
                Checks resolved markets, computes P&L + Brier
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                New Cohort
              </p>
              <p className="text-sm font-mono mt-1">Monday 00:00 UTC</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fresh $10K bankrolls, archives previous week
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Monitoring */}
      <div>
        <h2 className="text-lg font-semibold mb-4">API Cost Monitoring</h2>
        {costs ? (
          <CostDashboard data={costs} />
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No cost data yet. Costs are tracked after the first round.
          </p>
        )}
      </div>

      {/* Markets */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Markets</h2>
        {markets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No markets yet. Markets will be fetched on the next scheduled round.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {markets.map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
