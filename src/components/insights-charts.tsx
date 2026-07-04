"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  BiasRow,
  DivergenceBucket,
  ReliabilityBin,
  StrategyRow,
  SweepPoint,
} from "@/lib/insights";

const pct = (v: number) => `${Math.round(v * 100)}%`;

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-background p-2 text-xs shadow-sm">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. The skeptic bias: average predicted P(YES) vs realized YES rate.
// ---------------------------------------------------------------------------
export function BiasChart({ data }: { data: BiasRow[] }) {
  const rows = data.map((d) => ({
    ...d,
    label: `${d.emoji} ${d.name}`,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Average forecast vs. how often YES actually happened
        </CardTitle>
        <CardDescription>
          Every model&apos;s average P(YES) sits below the realized YES rate — a shared
          skepticism bias. The market price is much closer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis
                dataKey="label"
                fontSize={10}
                interval={0}
                tickLine={false}
                axisLine={false}
                angle={-20}
                textAnchor="end"
                height={54}
              />
              <YAxis
                domain={[0, 0.5]}
                tickFormatter={pct}
                fontSize={11}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof rows)[number];
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">avg forecast {pct(d.avgPred)}</p>
                      <p className="font-mono">realized YES {pct(d.actualYes)}</p>
                      <p className="text-muted-foreground">{d.n} scored forecasts</p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar dataKey="avgPred" name="Avg forecast" radius={3} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.id} fill={r.color} />
                ))}
              </Bar>
              <Bar
                dataKey="actualYes"
                name="Realized YES rate"
                radius={3}
                fill="#475569"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Colored bar: average predicted P(YES). Gray bar: share of those markets that
          resolved YES.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Reliability diagram: models pooled vs the crowd.
// ---------------------------------------------------------------------------
export function ReliabilityChart({ data }: { data: ReliabilityBin[] }) {
  const rows = data.map((d) => ({ ...d, diagonal: d.midpoint }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Reliability diagram</CardTitle>
        <CardDescription>
          For each stated confidence level, how often did the event actually happen?
          Perfect calibration lies on the diagonal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis
                dataKey="midpoint"
                type="number"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={pct}
                fontSize={11}
              />
              <YAxis
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={pct}
                fontSize={11}
                width={40}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof rows)[number];
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">Stated {d.bucket}</p>
                      {d.modelsActual != null && (
                        <p className="font-mono">
                          models: {pct(d.modelsActual)} actual ({d.modelsN})
                        </p>
                      )}
                      {d.crowdActual != null && (
                        <p className="font-mono">
                          crowd: {pct(d.crowdActual)} actual ({d.crowdN})
                        </p>
                      )}
                    </ChartTooltip>
                  );
                }}
              />
              <Line
                dataKey="diagonal"
                stroke="#334155"
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="modelsActual"
                name="6 models pooled"
                stroke="#F59E0B"
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                dataKey="crowdActual"
                name="Crowd"
                stroke="#94A3B8"
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Amber: all model forecasts pooled. Gray: the market price. Dashed: perfect
          calibration. Models saying &quot;15%&quot; were wrong often enough that those
          events landed near 34%.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Aggregation strategies compared (identical market-rounds).
// ---------------------------------------------------------------------------
export function StrategyChart({ data, n }: { data: StrategyRow[]; n: number }) {
  const fills: Record<string, string> = {
    hybrid: "#F43F5E",
    crowd: "#94A3B8",
    mean: "#F59E0B",
    logit: "#FBBF24",
    extremized: "#64748B",
    shrunk: "#64748B",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Six ways to aggregate the same forecasts
        </CardTitle>
        <CardDescription>
          Mean Brier over the same {n} settled market-rounds (lower is better).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => v.toFixed(2)} fontSize={11} />
              <YAxis dataKey="label" type="category" width={120} fontSize={11} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as StrategyRow;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">Brier {d.brier.toFixed(4)}</p>
                      <p className="max-w-[220px] text-muted-foreground">{d.desc}</p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar dataKey="brier" radius={3} isAnimationActive={false}>
                <LabelList
                  dataKey="brier"
                  position="right"
                  fontSize={11}
                  formatter={(v: number) => v.toFixed(4)}
                  className="fill-muted-foreground"
                />
                {data.map((d) => (
                  <Cell key={d.key} fill={fills[d.key] ?? "#64748B"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Blend-weight sweep: market weight from 0 (models only) to 1 (market only).
// ---------------------------------------------------------------------------
export function SweepChart({
  data,
  crowdBrier,
}: {
  data: SweepPoint[];
  crowdBrier: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          How much market, how much models?
        </CardTitle>
        <CardDescription>
          Brier of the logit blend as the market weight goes from 0 (models only) to 1
          (market only). The dip below the gray line is the models&apos; added information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis
                dataKey="w"
                type="number"
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={pct}
                fontSize={11}
                label={{
                  value: "weight on market price",
                  position: "insideBottom",
                  offset: -2,
                  fontSize: 11,
                }}
                height={40}
              />
              <YAxis
                tickFormatter={(v: number) => v.toFixed(2)}
                fontSize={11}
                width={44}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as SweepPoint;
                  return (
                    <ChartTooltip>
                      <p className="font-mono">
                        {pct(d.w)} market → Brier {d.brier.toFixed(4)}
                      </p>
                    </ChartTooltip>
                  );
                }}
              />
              <ReferenceLine
                y={crowdBrier}
                stroke="#94A3B8"
                strokeDasharray="4 4"
                label={{ value: "market alone", fontSize: 10, fill: "#94A3B8", position: "insideTopLeft" }}
              />
              <ReferenceLine x={0.8} stroke="#F43F5E" strokeDasharray="2 4" />
              <Line
                dataKey="brier"
                stroke="#F43F5E"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The vertical dashed line marks w = 0.8 — the blend the live{" "}
          <span className="text-rose-400">Market × Models</span> forecaster uses.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 5. When models fight the market, who wins?
// ---------------------------------------------------------------------------
export function DivergenceChart({ data }: { data: DivergenceBucket[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          When the models disagree with the market, who&apos;s right?
        </CardTitle>
        <CardDescription>
          Market-rounds bucketed by how far the model consensus sat from the price.
          &quot;Win&quot; = closer to the outcome.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} width={36} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as DivergenceBucket;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">models closer: {d.modelWins}</p>
                      <p className="font-mono">market closer: {d.crowdWins}</p>
                      <p className="text-muted-foreground">{d.n} market-rounds</p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar
                dataKey="modelWins"
                name="Models closer"
                fill="#F59E0B"
                radius={3}
                isAnimationActive={false}
              />
              <Bar
                dataKey="crowdWins"
                name="Market closer"
                fill="#94A3B8"
                radius={3}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Amber: model consensus was closer to the outcome. Gray: the market price was.
          Betting against the market on divergence alone is a losing rule — the edge only
          shows up as a small, systematic tilt.
        </p>
      </CardContent>
    </Card>
  );
}
