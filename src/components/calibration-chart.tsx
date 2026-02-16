"use client";

import {
    CartesianGrid,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Scatter,
    XAxis,
    YAxis,
    Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CalibrationDataPoint {
    bucket: string; // "10%", "20%", etc.
    midpoint: number; // 0.1, 0.2, etc.
    avgForecast: number;
    winRate: number;
    count: number;
}

interface CalibrationChartProps {
    data: CalibrationDataPoint[];
    brierScore: number;
    decomposition: {
        reliability: number;
        resolution: number;
        uncertainty: number;
    };
}

export function CalibrationChart({
    data,
    brierScore,
    decomposition,
}: CalibrationChartProps) {
    // Filter out empty buckets for the line/scatter, or keep them to show gaps?
    // Usually better to show points only where we have data.
    const activePoints = data.filter((d) => d.count > 0);

    return (
        <Card className="h-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Calibration</CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                        Brier: {brierScore.toFixed(4)}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={activePoints}
                            margin={{ top: 10, right: 10, bottom: 20, left: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis
                                dataKey="midpoint"
                                type="number"
                                domain={[0, 1]}
                                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                label={{ value: "Predicted Probability", position: "bottom", offset: 0, fontSize: 12 }}
                            />
                            <YAxis
                                domain={[0, 1]}
                                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                label={{ value: "Actual Win Rate", angle: -90, position: "left", offset: 0, fontSize: 12 }}
                            />
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const d = payload[0].payload as CalibrationDataPoint;
                                        return (
                                            <div className="bg-background border border-border p-2 rounded shadow-sm text-xs">
                                                <p className="font-semibold">Bucket: {d.bucket}</p>
                                                <p>Count: {d.count} bets</p>
                                                <p>Avg Pred: {(d.avgForecast * 100).toFixed(1)}%</p>
                                                <p>Win Rate: {(d.winRate * 100).toFixed(1)}%</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            {/* Perfect calibration line */}
                            <ReferenceLine
                                segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                                stroke="#666"
                                strokeDasharray="3 3"
                                opacity={0.5}
                            />
                            {/* Calibration curve */}
                            <Line
                                type="monotone"
                                dataKey="winRate"
                                stroke="var(--color-primary, #3b82f6)"
                                strokeWidth={2}
                                dot={false}
                            />
                            {/* Points sized by count could be cool, but simple scatter for now */}
                            <Scatter
                                dataKey="winRate"
                                fill="var(--color-primary, #3b82f6)"
                                r={4}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground text-center">
                    <div className="p-2 bg-muted/20 rounded">
                        <div className="font-semibold">Reliability</div>
                        <div>{decomposition.reliability.toFixed(4)}</div>
                    </div>
                    <div className="p-2 bg-muted/20 rounded">
                        <div className="font-semibold">Resolution</div>
                        <div>{decomposition.resolution.toFixed(4)}</div>
                    </div>
                    <div className="p-2 bg-muted/20 rounded">
                        <div className="font-semibold">Uncertainty</div>
                        <div>{decomposition.uncertainty.toFixed(4)}</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
