import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MODEL_COLORS, MODEL_LIST } from "@/lib/models";
import { fmtDollars, fmtPct, fmtBrier, fmtDate } from "@/lib/format";
import type { ModelStats, BetRow } from "@/lib/schemas";

interface ModelProfileData {
  stats: ModelStats | null;
  bets: BetRow[];
}

async function fetchModelProfile(id: string): Promise<ModelProfileData> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  try {
    const [lbRes, betsRes] = await Promise.all([
      fetch(`${base}/api/leaderboard`, { cache: "no-store" }),
      fetch(`${base}/api/models/${id}/bets`, { cache: "no-store" }),
    ]);

    let stats: ModelStats | null = null;
    if (lbRes.ok) {
      const data = await lbRes.json();
      const arr: ModelStats[] = data.allTime ?? data;
      stats = arr.find((m) => m.model_id === id) ?? null;
    }

    let bets: BetRow[] = [];
    if (betsRes.ok) {
      bets = await betsRes.json();
    }

    return { stats, bets };
  } catch {
    return { stats: null, bets: [] };
  }
}

function CalibrationPlaceholder() {
  const buckets = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Calibration Chart</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-64 w-full">
          {/* Grid lines */}
          <div className="absolute inset-0 grid grid-cols-9 gap-0">
            {buckets.map((b) => (
              <div key={b} className="border-r border-border/30 last:border-r-0" />
            ))}
          </div>
          {/* Diagonal (perfect calibration) */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/30" strokeDasharray="4 4" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">
              Calibration data will appear after bets are settled
            </p>
          </div>
          {/* X-axis labels */}
          <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[10px] text-muted-foreground px-2">
            <span>10%</span>
            <span>50%</span>
            <span>90%</span>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Confidence bucket</span>
          <span>Actual win rate</span>
        </div>
      </CardContent>
    </Card>
  );
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

export default async function ModelProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { stats, bets } = await fetchModelProfile(id);

  const modelInfo = MODEL_LIST.find((m) => m.id === id);
  const colors = MODEL_COLORS[id];

  if (!stats && !modelInfo) {
    return (
      <div className="space-y-4">
        <Link href="/models" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to models
        </Link>
        <p className="text-muted-foreground py-8 text-center">Model not found.</p>
      </div>
    );
  }

  const name = stats?.display_name ?? modelInfo?.name ?? id;
  const emoji = stats?.avatar_emoji ?? modelInfo?.emoji ?? "";
  const provider = stats?.provider ?? modelInfo?.provider ?? "";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/models" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to models
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-4xl">{emoji}</span>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight ${colors?.text ?? ""}`}>{name}</h1>
            <Badge variant="secondary">{provider}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: "Bankroll", value: fmtDollars(stats?.bankroll ?? 10000) },
          { label: "ROI", value: (stats?.roi_pct ?? 0) >= 0 ? `+${fmtPct(stats?.roi_pct ?? 0)}` : fmtPct(stats?.roi_pct ?? 0), color: (stats?.roi_pct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400" },
          { label: "Brier Score", value: fmtBrier(stats?.brier_score ?? 0) },
          { label: "Win Rate", value: fmtPct((stats?.win_rate ?? 0) * 100) },
          { label: "Total Bets", value: `${stats?.total_bets ?? 0} (${stats?.resolved_bets ?? 0})` },
          { label: "Pass Rate", value: fmtPct((stats?.pass_rate ?? 0) * 100) },
          { label: "Avg Confidence", value: fmtPct((stats?.avg_confidence ?? 0) * 100) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-bold font-mono ${(s as { color?: string }).color ?? ""}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CalibrationPlaceholder />

      <div>
        <h2 className="text-lg font-semibold mb-4">Bet History</h2>
        {bets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No bets yet for this model.
          </p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Bet</TableHead>
                  <TableHead>Mkt Price</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Brier</TableHead>
                  <TableHead>Round</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bets.map((bet) => (
                  <TableRow key={bet.id}>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(bet.created_at)}</TableCell>
                    <TableCell>{actionBadge(bet.action)}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {bet.confidence != null ? `${Math.round(bet.confidence * 100)}%` : "--"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {bet.bet_amount != null ? fmtDollars(bet.bet_amount) : "--"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {bet.market_price_at_bet != null ? `${Math.round(bet.market_price_at_bet * 100)}c` : "--"}
                    </TableCell>
                    <TableCell className={`font-mono text-sm font-semibold ${bet.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {bet.settled ? `${bet.pnl >= 0 ? "+" : ""}${fmtDollars(bet.pnl)}` : "--"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {bet.brier_score != null ? fmtBrier(bet.brier_score) : "--"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/rounds/${bet.round_id}`} className="text-xs text-muted-foreground hover:underline">
                        {bet.round_id.slice(0, 8)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
