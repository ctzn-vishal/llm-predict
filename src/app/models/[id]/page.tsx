import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
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
import { getCalibrationCurve, decomposeBrier } from "@/lib/scoring";
import { CalibrationChart } from "@/components/calibration-chart";

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

  // Prepare calibration data
  const settledBets = bets.filter(b => b.settled === 1 && b.estimated_probability != null);
  const calibrationInputs = settledBets.map(b => {
    // Infer resolved_yes from PnL and Action
    // Yes bet, positive PnL -> Yes
    // Yes bet, negative PnL -> No
    // No bet, positive PnL -> No (won on No)
    // No bet, negative PnL -> Yes (lost on No)
    let resolved_yes = false; // default
    if (b.action === 'bet_yes') {
      resolved_yes = b.pnl > 0;
    } else if (b.action === 'bet_no') {
      resolved_yes = b.pnl < 0;
    }
    return {
      estimated_probability: b.estimated_probability!,
      resolved_yes
    };
  });

  const calibrationCurve = getCalibrationCurve(calibrationInputs);
  const decomposition = decomposeBrier(calibrationInputs);

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

      <div className="h-[400px]">
        <CalibrationChart
          data={calibrationCurve}
          brierScore={stats?.brier_score ?? 0}
          decomposition={decomposition}
        />
      </div>

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
