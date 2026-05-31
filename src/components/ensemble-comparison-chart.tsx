"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EnsembleComparison } from "@/lib/schemas";
import { forecasterMeta } from "@/lib/models";
import { fmtBrier } from "@/lib/format";

interface EnsembleComparisonChartProps {
  comparison: EnsembleComparison;
}

// Four Brier scores side by side: the average model, the single best model, the
// ensemble (mean of all 6), and the crowd. Lower is better, so a shorter
// "Ensemble" bar than "Avg model" is the headline pooling effect.
export function EnsembleComparisonChart({ comparison }: EnsembleComparisonChartProps) {
  const bestName = comparison.bestIndividualId
    ? forecasterMeta(comparison.bestIndividualId).name
    : "Best model";

  const rows = [
    { label: "Avg model", brier: comparison.meanIndividualBrier, fill: "#64748B" },
    { label: "Best model", brier: comparison.bestIndividualBrier, fill: "#38BDF8", note: bestName },
    { label: "Ensemble", brier: comparison.ensembleBrier, fill: "#F59E0B" },
    { label: "Crowd", brier: comparison.crowdBrier, fill: "#94A3B8" },
  ];

  if (comparison.nMarkets === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Ensemble vs. its parts</CardTitle>
          <CardDescription>Mean Brier on the shared resolved set (lower is better)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No resolved forecasts yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxBrier = Math.max(...rows.map((r) => r.brier), 0.01);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Ensemble vs. its parts</CardTitle>
        <CardDescription>
          Mean Brier across {comparison.nMarkets} shared markets (lower is better)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 24, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, maxBrier * 1.15]}
                tickFormatter={(v: number) => v.toFixed(2)}
                fontSize={11}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof rows)[number];
                  return (
                    <div className="rounded border border-border bg-background p-2 text-xs shadow-sm">
                      <p className="font-semibold">{d.label}</p>
                      {d.note && <p className="text-muted-foreground">{d.note}</p>}
                      <p className="font-mono">Brier {fmtBrier(d.brier)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="brier" radius={3} isAnimationActive={false}>
                <LabelList
                  dataKey="brier"
                  position="top"
                  fontSize={11}
                  formatter={(v: number) => v.toFixed(3)}
                  className="fill-muted-foreground"
                />
                {rows.map((r) => (
                  <Cell key={r.label} fill={r.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
