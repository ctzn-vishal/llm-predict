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
import type { BaselineRow } from "@/lib/betting";
import type { BankrollPoint, GameRow } from "@/lib/game";

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-background p-2 text-xs shadow-sm">
      {children}
    </div>
  );
}

const money = (v: number) => `$${v.toFixed(0)}`;
const unit = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;

// ---------------------------------------------------------------------------
// Selectivity alpha -- the scored metric. Flat stakes, so each market is one
// independent observation and the bootstrap means what it says.
// ---------------------------------------------------------------------------
export function AlphaChart({ data }: { data: GameRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Selectivity alpha — did choosing beat not choosing?
        </CardTitle>
        <CardDescription>
          Mean flat-stake profit per opportunity under the model&apos;s own bet/pass choices,
          minus what betting every edge would have earned on the same markets. Above zero means
          the bets it declined would have lost money.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(220, data.length * 44 + 50) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.map((d) => ({ ...d, label: `${d.emoji} ${d.name}` }))}
              layout="vertical"
              margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => v.toFixed(2)} fontSize={11} />
              <YAxis dataKey="label" type="category" width={140} fontSize={10} interval={0} />
              <ReferenceLine x={0} stroke="#94A3B8" />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as GameRow & { label: string };
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">alpha {unit(d.alpha)}</p>
                      {d.alphaLo != null && (
                        <p className="font-mono text-muted-foreground">
                          90% CI [{d.alphaLo.toFixed(3)}, {d.alphaHi?.toFixed(3)}]
                        </p>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        bet {d.nBet}, passed {d.nPass} of {d.n}
                      </p>
                      <p className="text-muted-foreground">
                        declined bets averaged {unit(d.passedPnl)}
                      </p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar dataKey="alpha" radius={2} isAnimationActive={false}>
                <LabelList
                  dataKey="alpha"
                  position="right"
                  fontSize={10}
                  formatter={unit}
                  className="fill-muted-foreground"
                />
                {data.map((d) => (
                  <Cell
                    key={d.forecasterId}
                    fill={d.alpha >= 0 ? "#10A37F" : "#F43F5E"}
                    fillOpacity={d.alphaSignificant ? 1 : 0.45}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Solid bars have a 90% interval clear of zero; faded bars do not and should be read as
          &quot;no detectable skill either way&quot;.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Baselines. Without these a betting result is uninterpretable.
// ---------------------------------------------------------------------------
export function BaselineChart({ data }: { data: BaselineRow[] }) {
  const fills: Record<string, string> = {
    "bet-everything": "#F59E0B",
    "random-passer": "#8B5CF6",
    "always-no": "#94A3B8",
    "always-yes": "#64748B",
    "random-side": "#475569",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Baselines that cost nothing</CardTitle>
        <CardDescription>
          Mean flat-stake profit per opportunity, on exactly the markets the models faced. A model
          that cannot beat these has demonstrated nothing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(200, data.length * 42 + 40) }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 60, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => v.toFixed(2)} fontSize={11} />
              <YAxis dataKey="label" type="category" width={170} fontSize={10} interval={0} />
              <ReferenceLine x={0} stroke="#94A3B8" />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as BaselineRow;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">{unit(d.pnl)} per opportunity</p>
                      <p className="max-w-[240px] text-muted-foreground">{d.desc}</p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar dataKey="pnl" radius={2} isAnimationActive={false}>
                <LabelList
                  dataKey="pnl"
                  position="right"
                  fontSize={10}
                  formatter={unit}
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
// The compounding bankroll -- explicitly the narrative, not the metric.
// ---------------------------------------------------------------------------
export function BankrollChart({
  data,
  models,
  start,
}: {
  data: BankrollPoint[];
  models: { forecasterId: string; name: string; emoji: string; color: string }[];
  start: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Bankrolls — half-Kelly, compounding, ${start.toLocaleString()} to start
        </CardTitle>
        <CardDescription>
          For watching, not for scoring. This is path-dependent: an early win compounds into every
          later bet, so the final standing rewards luck as much as judgement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis
                dataKey="i"
                fontSize={11}
                label={{ value: "settled decisions", position: "insideBottom", offset: -2, fontSize: 11 }}
                height={40}
              />
              <YAxis tickFormatter={money} fontSize={11} width={56} />
              <ReferenceLine y={start} stroke="#94A3B8" strokeDasharray="4 4" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">after {String(label)} decisions</p>
                      {payload
                        .slice()
                        .sort((a, b) => Number(b.value) - Number(a.value))
                        .map((p) => {
                          const m = models.find((x) => x.forecasterId === p.dataKey);
                          return (
                            <p key={String(p.dataKey)} className="font-mono" style={{ color: p.color }}>
                              {m?.emoji} {m?.name}: {money(Number(p.value))}
                            </p>
                          );
                        })}
                    </ChartTooltip>
                  );
                }}
              />
              {models.map((m) => (
                <Line
                  key={m.forecasterId}
                  dataKey={m.forecasterId}
                  name={m.name}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The dashed line is the starting balance. Half-Kelly stakes, sized from each model&apos;s
          own blind probability against the price it was shown.
        </p>
      </CardContent>
    </Card>
  );
}
