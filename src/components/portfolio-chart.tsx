"use client";

import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDollars, fmtDateShort } from "@/lib/format";

interface PortfolioChartProps {
    data: {
        date: string; // ISO string
        [key: string]: number | string; // modelId -> bankroll
    }[];
    models: {
        id: string;
        name: string;
        color: string;
    }[];
    title?: string;
}

export function PortfolioChart({ data, models, title = "Portfolio Value" }: PortfolioChartProps) {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                            data={data}
                            margin={{ top: 10, right: 10, bottom: 20, left: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(val) => fmtDateShort(val)}
                                minTickGap={30}
                                tick={{ fontSize: 10 }}
                                stroke="#666"
                            />
                            <YAxis
                                tickFormatter={(val) => fmtDollars(val)}
                                domain={['auto', 'auto']}
                                tick={{ fontSize: 10 }}
                                width={60}
                                stroke="#666"
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-background border border-border p-2 rounded shadow-sm text-xs z-50">
                                                <p className="font-semibold mb-1">{fmtDateShort(label)}</p>
                                                {payload.map((p) => {
                                                    const model = models.find(m => m.id === p.dataKey);
                                                    return (
                                                        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ backgroundColor: p.color }}
                                                            />
                                                            <span className="text-muted-foreground">{model?.name ?? p.name}:</span>
                                                            <span className="font-mono font-medium">
                                                                {fmtDollars(p.value as number)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend formatter={(value) => <span className="text-xs">{models.find(m => m.id === value)?.name ?? value}</span>} />

                            {models.map((model) => (
                                <Line
                                    key={model.id}
                                    type="monotone" // or stepAfter
                                    dataKey={model.id}
                                    stroke={model.color}
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                    activeDot={{ r: 4 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
