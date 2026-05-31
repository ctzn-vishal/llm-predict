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
import { fmtBrier, fmtPct, fmtSkill, fmtProb, fmtDate } from "@/lib/format";
import { getCalibrationCurve, getLeaderboard } from "@/lib/scoring";
import { CalibrationChart } from "@/components/calibration-chart";
import { forecasterMeta } from "@/lib/models";
import { queryAll } from "@/lib/db";
import type { CalibrationBucket, ForecasterStats } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface ForecastHistoryRow {
  id: number;
  round_id: string;
  market_id: string;
  prob_yes: number | null;
  crowd_price: number | null;
  ok: number;
  error: string | null;
  settled: number;
  outcome: number | null;
  brier: number | null;
  log_loss: number | null;
  created_at: string;
  question: string;
  market_resolved: number;
}

// Murphy decomposition straight from the binned calibration curve, so the boxes
// shown under the chart match the curve exactly.
function decompFromBuckets(buckets: CalibrationBucket[]) {
  const N = buckets.reduce((s, b) => s + b.count, 0);
  if (N === 0) return { reliability: 0, resolution: 0, uncertainty: 0 };
  const base = buckets.reduce((s, b) => s + b.winRate * b.count, 0) / N;
  let reliability = 0;
  let resolution = 0;
  for (const b of buckets) {
    if (!b.count) continue;
    reliability += (b.count / N) * (b.avgForecast - b.winRate) ** 2;
    resolution += (b.count / N) * (b.winRate - base) ** 2;
  }
  return { reliability, resolution, uncertainty: base * (1 - base) };
}

async function fetchProfile(id: string): Promise<{
  stats: ForecasterStats | null;
  history: ForecastHistoryRow[];
  calibration: CalibrationBucket[];
}> {
  try {
    const [board, calibration, history] = await Promise.all([
      getLeaderboard(),
      getCalibrationCurve(id),
      queryAll<ForecastHistoryRow>(
        `SELECT f.id, f.round_id, f.market_id, f.prob_yes, f.crowd_price,
                f.ok, f.error, f.settled, f.outcome, f.brier, f.log_loss, f.created_at,
                mk.question, mk.resolved AS market_resolved
         FROM forecasts f
         JOIN markets mk ON mk.id = f.market_id
         WHERE f.forecaster_id = @id
         ORDER BY f.created_at DESC`,
        { id },
      ),
    ]);
    return { stats: board.find((f) => f.forecaster_id === id) ?? null, history, calibration };
  } catch (error) {
    console.error("Error fetching model profile:", error);
    return { stats: null, history: [], calibration: [] };
  }
}

function outcomeBadge(outcome: number | null) {
  if (outcome === 1) return <Badge className="bg-emerald-500/20 text-emerald-400">YES</Badge>;
  if (outcome === 0) return <Badge className="bg-red-500/20 text-red-400">NO</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

export default async function ModelProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { stats, history, calibration } = await fetchProfile(id);

  const meta = forecasterMeta(id);
  if (!stats && history.length === 0) {
    return (
      <div className="space-y-4">
        <Link href="/models" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to models
        </Link>
        <p className="py-8 text-center text-muted-foreground">No data for this forecaster yet.</p>
      </div>
    );
  }

  const empty = !stats || stats.n_resolved === 0;
  const isCrowd = meta.kind === "crowd";
  const decomposition = decompFromBuckets(calibration);

  const statCards: { label: string; value: string; color?: string }[] = [
    {
      label: "Skill vs Crowd",
      value: empty || isCrowd ? "—" : fmtSkill(stats!.skill_vs_crowd),
      color: empty || isCrowd ? undefined : stats!.skill_vs_crowd >= 0 ? "text-emerald-400" : "text-red-400",
    },
    { label: "Brier", value: empty ? "—" : fmtBrier(stats!.brier) },
    { label: "Log Loss", value: empty ? "—" : stats!.log_loss.toFixed(3) },
    { label: "ECE", value: empty ? "—" : fmtBrier(stats!.calibration_error) },
    { label: "Resolution", value: empty ? "—" : fmtBrier(stats!.resolution) },
    { label: "Forecasts", value: `${stats?.n_total ?? history.length} (${stats?.n_resolved ?? 0})` },
    { label: "Reliability", value: fmtPct((stats?.ok_rate ?? 0) * 100) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/models" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to models
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-4xl">{meta.emoji}</span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: meta.color }}>
              {meta.name}
            </h1>
            <Badge variant="secondary">{meta.provider}</Badge>
          </div>
        </div>
        {isCrowd && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The crowd is the Polymarket price itself — the baseline every model is measured
            against. It cannot have skill &ldquo;vs. the crowd&rdquo; because it is the crowd.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`font-mono text-lg font-bold ${s.color ?? ""}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!empty && (
        <CalibrationChart
          data={calibration}
          brierScore={stats!.brier}
          decomposition={decomposition}
        />
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold">Forecast history</h2>
        {history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No forecasts yet for this forecaster.
          </p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">P(YES)</TableHead>
                  <TableHead className="text-right">Crowd</TableHead>
                  <TableHead className="text-center">Outcome</TableHead>
                  <TableHead className="text-right">Brier</TableHead>
                  <TableHead>Round</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(h.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      {h.ok === 0 ? (
                        <span className="flex items-center gap-2">
                          <span className="line-clamp-1 text-muted-foreground">{h.question}</span>
                          <Badge
                            variant="outline"
                            className="shrink-0 border-red-500/40 text-[10px] text-red-400"
                            title={h.error ?? "forecast failed"}
                          >
                            failed
                          </Badge>
                        </span>
                      ) : (
                        <span className="line-clamp-1">{h.question}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {h.prob_yes != null ? fmtProb(h.prob_yes) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {h.crowd_price != null ? fmtProb(h.crowd_price) : "—"}
                    </TableCell>
                    <TableCell className="text-center">{outcomeBadge(h.outcome)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {h.brier != null ? fmtBrier(h.brier) : "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/rounds/${h.round_id}`}
                        className="font-mono text-xs text-muted-foreground hover:underline"
                      >
                        {h.round_id.slice(0, 8)}
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
