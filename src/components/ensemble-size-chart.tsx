"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EnsembleSizePoint } from "@/lib/schemas";
import { fmtBrier } from "@/lib/format";

interface EnsembleSizeChartProps {
  data: EnsembleSizePoint[];
}

// "How many models do you need?" — mean Brier of a size-k ensemble, averaged
// over every k-subset of the models. A curve that flattens shows diminishing
// returns: most of the gain comes from the first few models.
export function EnsembleSizeChart({ data }: EnsembleSizeChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">How many models do you need?</CardTitle>
          <CardDescription>Mean Brier by ensemble size (lower is better)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No resolved forecasts yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const briers = data.flatMap((d) => [d.brier, d.meanIndividualBrier]);
  const lo = Math.min(...briers);
  const hi = Math.max(...briers);
  const pad = Math.max((hi - lo) * 0.2, 0.005);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">How many models do you need?</CardTitle>
        <CardDescription>
          Mean Brier of a size-k ensemble, averaged over all k-model subsets (lower is better)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 16, bottom: 20, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis
                dataKey="size"
                type="number"
                domain={[1, data.length]}
                tickCount={data.length}
                allowDecimals={false}
                fontSize={11}
                label={{ value: "Models in ensemble", position: "bottom", offset: 4, fontSize: 12 }}
              />
              <YAxis
                domain={[lo - pad, hi + pad]}
                tickFormatter={(v: number) => v.toFixed(3)}
                fontSize={11}
                width={48}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as EnsembleSizePoint;
                  return (
                    <div className="rounded border border-border bg-background p-2 text-xs shadow-sm">
                      <p className="font-semibold">{d.size} model{d.size === 1 ? "" : "s"}</p>
                      <p className="font-mono text-amber-400">Ensemble Brier {fmtBrier(d.brier)}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={data[0]?.meanIndividualBrier}
                stroke="#64748B"
                strokeDasharray="4 4"
                label={{ value: "avg single model", position: "insideTopRight", fontSize: 10, fill: "#94A3B8" }}
              />
              <Line
                type="monotone"
                dataKey="brier"
                stroke="#F59E0B"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#F59E0B" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
