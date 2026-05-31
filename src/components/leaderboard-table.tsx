"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtBrier, fmtSkill, fmtPct } from "@/lib/format";
import type { ForecasterStats } from "@/lib/schemas";

type SortKey =
  | "skill_vs_crowd"
  | "brier"
  | "log_loss"
  | "calibration_error"
  | "resolution"
  | "n_resolved"
  | "ok_rate";

// Metrics where a smaller number is better, so a first click should sort ascending.
const LOWER_IS_BETTER: Record<SortKey, boolean> = {
  skill_vs_crowd: false,
  brier: true,
  log_loss: true,
  calibration_error: true,
  resolution: false,
  n_resolved: false,
  ok_rate: false,
};

interface LeaderboardTableProps {
  data: ForecasterStats[];
}

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("skill_vs_crowd");
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(LOWER_IS_BETTER[key]);
    }
  }

  const sorted = [...data].sort((a, b) => {
    // Forecasters with nothing resolved yet always sink to the bottom.
    const aEmpty = a.n_resolved === 0;
    const bEmpty = b.n_resolved === 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    const mul = sortAsc ? 1 : -1;
    return mul * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
  });

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null;
    return sortAsc ? " ▲" : " ▼";
  }

  const th = "cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors";

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Forecaster</TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("skill_vs_crowd")}>
              Skill vs Crowd{sortIcon("skill_vs_crowd")}
            </TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("brier")}>
              Brier{sortIcon("brier")}
            </TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("log_loss")}>
              Log Loss{sortIcon("log_loss")}
            </TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("calibration_error")}>
              ECE{sortIcon("calibration_error")}
            </TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("resolution")}>
              Resolution{sortIcon("resolution")}
            </TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("n_resolved")}>
              Forecasts{sortIcon("n_resolved")}
            </TableHead>
            <TableHead className={`text-right ${th}`} onClick={() => handleSort("ok_rate")}>
              Reliability{sortIcon("ok_rate")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                No resolved forecasts yet. Run a round and wait for markets to settle.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((f, i) => {
            const isCrowd = f.kind === "crowd";
            const isEnsemble = f.kind === "ensemble";
            const isModel = f.kind === "model";
            const empty = f.n_resolved === 0;

            const nameNode = (
              <span className="flex items-center gap-2">
                <span className="text-lg">{f.avatar_emoji}</span>
                <span style={{ color: f.color, fontWeight: 600 }}>{f.display_name}</span>
                {isCrowd && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    baseline
                  </Badge>
                )}
                {isEnsemble && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px] font-normal">
                    ensemble
                  </Badge>
                )}
                {isModel && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {f.provider}
                  </Badge>
                )}
              </span>
            );

            return (
              <TableRow
                key={f.forecaster_id}
                className={
                  isCrowd
                    ? "bg-muted/30 hover:bg-muted/40"
                    : isEnsemble
                      ? "bg-amber-500/5 hover:bg-amber-500/10"
                      : "hover:bg-accent/50"
                }
              >
                <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  {isModel ? (
                    <Link href={`/models/${f.forecaster_id}`} className="hover:underline">
                      {nameNode}
                    </Link>
                  ) : (
                    nameNode
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {isCrowd || empty ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={f.skill_vs_crowd >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {fmtSkill(f.skill_vs_crowd)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {empty ? <span className="text-muted-foreground">—</span> : fmtBrier(f.brier)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {empty ? "—" : f.log_loss.toFixed(3)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {empty ? "—" : fmtBrier(f.calibration_error)}
                </TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {empty ? "—" : fmtBrier(f.resolution)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {f.n_resolved}
                  <span className="text-muted-foreground"> / {f.n_total}</span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span className={f.ok_rate >= 0.9 ? "text-foreground" : "text-amber-400"}>
                    {fmtPct(f.ok_rate * 100)}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
