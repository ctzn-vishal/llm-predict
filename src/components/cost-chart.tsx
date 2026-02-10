"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MODEL_COLORS } from "@/lib/models";

interface CostSummary {
  total_spent: number;
  budget_cap: number;
  budget_remaining: number;
  budget_pct_used: number;
  is_over_budget: boolean;
  per_model: { model_id: string; display_name: string; cost: number }[];
  per_round: { round_id: string; created_at: string; cost: number }[];
  daily: { date: string; cost: number; cumulative: number }[];
}

export function CostDashboard({ data }: { data: CostSummary }) {
  const pctUsed = Math.min(data.budget_pct_used, 100);
  const barColor =
    pctUsed > 90 ? "#ef4444" : pctUsed > 70 ? "#f59e0b" : "#10b981";

  return (
    <div className="space-y-6">
      {/* Budget Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              ${data.total_spent.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Budget Remaining
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              ${data.budget_remaining.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Budget Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono" style={{ color: barColor }}>
              {pctUsed.toFixed(1)}%
            </p>
            <div className="mt-2 h-2 w-full rounded-full bg-muted">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${pctUsed}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cumulative Spend Over Time */}
      {data.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Cumulative API Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
                />
                <ReferenceLine
                  y={data.budget_cap}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  label={{
                    value: `$${data.budget_cap} cap`,
                    position: "right",
                    fill: "#ef4444",
                    fontSize: 11,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Cumulative"
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#6366f1"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  name="Daily"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-Model Cost Breakdown */}
      {data.per_model.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Cost by Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.per_model} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                />
                <YAxis
                  type="category"
                  dataKey="display_name"
                  width={120}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(value: number) => [`$${value.toFixed(4)}`, "Cost"]}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {data.per_model.map((entry) => (
                    <Cell
                      key={entry.model_id}
                      fill={
                        MODEL_COLORS[entry.model_id]?.primary ?? "#6366f1"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-Round Cost Table */}
      {data.per_round.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Cost by Round
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {data.per_round.map((r) => (
                <div
                  key={r.round_id}
                  className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0"
                >
                  <span className="font-mono text-muted-foreground">
                    {r.round_id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  <span className="font-mono font-medium">
                    ${r.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Warning */}
      {data.is_over_budget && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-red-400">
              Budget cap of ${data.budget_cap.toFixed(2)} reached. Automated
              rounds are paused. No further API calls will be made.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
