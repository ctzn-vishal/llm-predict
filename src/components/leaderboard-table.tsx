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
import { MODEL_COLORS } from "@/lib/models";
import { fmtDollars, fmtPct, fmtBrier } from "@/lib/format";
import type { ModelStats } from "@/lib/schemas";

type SortKey = "bankroll" | "roi_pct" | "brier_score" | "win_rate" | "total_bets" | "pass_rate";

interface LeaderboardTableProps {
  data: ModelStats[];
}

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("roi_pct");
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "brier_score");
    }
  }

  const sorted = [...data].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    return mul * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
  });

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return null;
    return sortAsc ? " \u25B2" : " \u25BC";
  }

  const headerClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className={headerClass} onClick={() => handleSort("bankroll")}>
              Bankroll{sortIcon("bankroll")}
            </TableHead>
            <TableHead className={headerClass} onClick={() => handleSort("roi_pct")}>
              ROI %{sortIcon("roi_pct")}
            </TableHead>
            <TableHead className={headerClass} onClick={() => handleSort("brier_score")}>
              Brier{sortIcon("brier_score")}
            </TableHead>
            <TableHead className={headerClass} onClick={() => handleSort("win_rate")}>
              Win Rate{sortIcon("win_rate")}
            </TableHead>
            <TableHead className={headerClass} onClick={() => handleSort("total_bets")}>
              Bets{sortIcon("total_bets")}
            </TableHead>
            <TableHead className={headerClass} onClick={() => handleSort("pass_rate")}>
              Pass %{sortIcon("pass_rate")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                No data yet. Run a round to populate the leaderboard.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((m, i) => {
            const colors = MODEL_COLORS[m.model_id];
            return (
              <TableRow key={m.model_id} className="hover:bg-accent/50">
                <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Link href={`/models/${m.model_id}`} className="flex items-center gap-2 hover:underline">
                    <span className="text-lg">{m.avatar_emoji}</span>
                    <span className={colors?.text ?? "text-foreground"} style={{ fontWeight: 600 }}>
                      {m.display_name}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {m.provider}
                    </Badge>
                  </Link>
                </TableCell>
                <TableCell className="font-mono font-semibold">{fmtDollars(m.bankroll)}</TableCell>
                <TableCell className={`font-mono ${m.roi_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {m.roi_pct >= 0 ? "+" : ""}{fmtPct(m.roi_pct)}
                </TableCell>
                <TableCell className="font-mono">{fmtBrier(m.brier_score)}</TableCell>
                <TableCell className="font-mono">{fmtPct(m.win_rate * 100)}</TableCell>
                <TableCell className="font-mono">{m.total_bets}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{fmtPct(m.pass_rate * 100)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
