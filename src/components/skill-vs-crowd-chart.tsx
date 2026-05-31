"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ForecasterStats } from "@/lib/schemas";
import { fmtSkill, fmtBrier } from "@/lib/format";

const POS = "#34d399"; // beat the crowd
const NEG = "#f87171"; // lost to the crowd

interface SkillVsCrowdChartProps {
  data: ForecasterStats[];
}

// Diverging bar chart of each forecaster's Brier skill over the crowd baseline.
// Bars to the right (green) beat the market; bars to the left (red) lost to it.
export function SkillVsCrowdChart({ data }: SkillVsCrowdChartProps) {
  const rows = data
    .filter((f) => f.kind !== "crowd" && f.n_resolved > 0)
    .map((f) => ({
      id: f.forecaster_id,
      name: f.display_name,
      kind: f.kind,
      skill: f.skill_vs_crowd,
      brier: f.brier,
    }))
    .sort((a, b) => b.skill - a.skill);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Skill vs. the Crowd</CardTitle>
          <CardDescription>Brier improvement over the market price</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No resolved forecasts yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.skill)), 0.01);
  const domain = [-maxAbs * 1.15, maxAbs * 1.15];
  const height = Math.max(220, rows.length * 44);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Skill vs. the Crowd</CardTitle>
        <CardDescription>
          Brier improvement over the market price (positive = beat the crowd)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
              <XAxis
                type="number"
                domain={domain}
                tickFormatter={(v: number) => v.toFixed(3)}
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof rows)[number];
                  const verb = d.skill >= 0 ? "beats" : "trails";
                  return (
                    <div className="rounded border border-border bg-background p-2 text-xs shadow-sm">
                      <p className="font-semibold">{d.name}</p>
                      <p className={d.skill >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {fmtSkill(d.skill)} Brier — {verb} the crowd
                      </p>
                      <p className="text-muted-foreground">Brier {fmtBrier(d.brier)}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={0} stroke="#94A3B8" strokeWidth={1.5} />
              <Bar dataKey="skill" radius={2} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell
                    key={r.id}
                    fill={r.skill >= 0 ? POS : NEG}
                    stroke={r.kind === "ensemble" ? "#F59E0B" : undefined}
                    strokeWidth={r.kind === "ensemble" ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
