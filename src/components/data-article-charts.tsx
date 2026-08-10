"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
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
import type { CategoryRow, HorizonRow, SpreadRow } from "@/lib/data-article";

const CROWD = "#94A3B8";
const ENSEMBLE = "#F59E0B";
const HYBRID = "#F43F5E";

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-background p-2 text-xs shadow-sm">
      {children}
    </div>
  );
}

const b4 = (v: number) => v.toFixed(4);
const pct = (v: number) => `${Math.round(v * 100)}%`;

// ---------------------------------------------------------------------------
// 1. Difficulty and edge by topic.
// ---------------------------------------------------------------------------
export function CategoryChart({ data }: { data: CategoryRow[] }) {
  const height = Math.max(240, data.length * 42 + 60);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Which topics are hard — and where do the models help?
        </CardTitle>
        <CardDescription>
          Mean Brier by the market&apos;s primary Polymarket tag, lower is better. Bars ordered
          by how hard the topic was for the market itself.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
              <XAxis type="number" tickFormatter={(v: number) => v.toFixed(2)} fontSize={11} />
              <YAxis dataKey="category" type="category" width={130} fontSize={10} interval={0} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as CategoryRow;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.category}</p>
                      <p className="font-mono">crowd {b4(d.crowd)}</p>
                      <p className="font-mono">ensemble {b4(d.ensemble)}</p>
                      <p className="font-mono">hybrid {b4(d.hybrid)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {d.n} market-rounds · {pct(d.yesRate)} resolved YES
                      </p>
                      <p className={d.hybridEdge > 0 ? "text-emerald-400" : "text-red-400"}>
                        hybrid edge {d.hybridEdge >= 0 ? "+" : ""}
                        {d.hybridEdge.toFixed(4)}
                      </p>
                    </ChartTooltip>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="crowd" name="Crowd" fill={CROWD} radius={2} isAnimationActive={false} />
              <Bar
                dataKey="ensemble"
                name="Ensemble"
                fill={ENSEMBLE}
                radius={2}
                isAnimationActive={false}
              />
              <Bar dataKey="hybrid" name="Market × Models" fill={HYBRID} radius={2} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A topic where the amber bar sits far above the gray one is a topic where the models,
          left to themselves, are lost. What matters for the project is the rose bar: whenever it
          dips below gray, the model consensus improved a price it never saw.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Lead time.
// ---------------------------------------------------------------------------
export function HorizonChart({ data }: { data: HorizonRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Does lead time change the picture?</CardTitle>
        <CardDescription>
          Mean Brier by how far the resolution date was when the forecast was made.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => v.toFixed(2)} fontSize={11} width={44} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as HorizonRow;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">crowd {b4(d.crowd)}</p>
                      <p className="font-mono">ensemble {b4(d.ensemble)}</p>
                      <p className="font-mono">hybrid {b4(d.hybrid)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {d.n} market-rounds · avg {d.avgDays.toFixed(1)} days out
                      </p>
                    </ChartTooltip>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="crowd" name="Crowd" fill={CROWD} radius={3} isAnimationActive={false} />
              <Bar dataKey="ensemble" name="Ensemble" fill={ENSEMBLE} radius={3} isAnimationActive={false} />
              <Bar dataKey="hybrid" name="Market × Models" fill={HYBRID} radius={3} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Two effects fight here: distant questions are genuinely harder, but the arena&apos;s
          own selection gate only admits markets that are still live and mid-priced, which trims
          the easy ones out of every bucket.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 3. Model disagreement as a difficulty signal.
// ---------------------------------------------------------------------------
export function SpreadChart({ data }: { data: SpreadRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Is model disagreement a usable warning light?
        </CardTitle>
        <CardDescription>
          Market-rounds bucketed by how far apart the six models were (standard deviation of
          their probabilities).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => v.toFixed(2)} fontSize={11} width={44} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as SpreadRow;
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">crowd Brier {b4(d.crowd)}</p>
                      <p className="font-mono">ensemble Brier {b4(d.ensemble)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {d.n} market-rounds · avg spread {(d.avgSpread * 100).toFixed(1)} pts
                      </p>
                      <p className="text-muted-foreground">
                        consensus sat {(d.avgGapToPrice * 100).toFixed(1)} pts from the price
                      </p>
                    </ChartTooltip>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="crowd" name="Crowd Brier" fill={CROWD} radius={3} isAnimationActive={false} />
              <Bar dataKey="ensemble" name="Ensemble Brier" fill={ENSEMBLE} radius={3} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The models cannot see the price, so their disagreement is an independent read on
          difficulty. If the gray bars climb with the spread, the models are detecting hard
          questions that the market also finds hard — a free uncertainty signal that costs no
          extra API call.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Per-model unit cost, for the operations section.
// ---------------------------------------------------------------------------
export function CostPerScoredChart({
  data,
}: {
  data: { name: string; emoji: string; color: string; costPerScored: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">What one scored forecast costs</CardTitle>
        <CardDescription>
          Total API spend for a model divided by the number of its forecasts that actually
          settled — so timeouts and unparseable answers are paid for but earn nothing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.map((d) => ({ ...d, label: `${d.emoji} ${d.name}` }))}
              layout="vertical"
              margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                fontSize={11}
              />
              <YAxis dataKey="label" type="category" width={140} fontSize={10} interval={0} />
              <ReferenceLine x={0.005} stroke={CROWD} strokeDasharray="3 3" />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as { label: string; costPerScored: number };
                  return (
                    <ChartTooltip>
                      <p className="font-semibold">{d.label}</p>
                      <p className="font-mono">${d.costPerScored.toFixed(4)} per scored forecast</p>
                    </ChartTooltip>
                  );
                }}
              />
              <Bar dataKey="costPerScored" radius={3} isAnimationActive={false}>
                <LabelList
                  dataKey="costPerScored"
                  position="right"
                  fontSize={10}
                  formatter={(v: number) => `$${v.toFixed(4)}`}
                  className="fill-muted-foreground"
                />
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The dashed line marks the ~$0.005 Exa web-search fee that every call pays regardless of
          model. Below it is essentially free; the search, not the inference, is the cost driver.
        </p>
      </CardContent>
    </Card>
  );
}
