"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CorrelationCell } from "@/lib/schemas";
import { MODELS_ONLY, forecasterMeta } from "@/lib/models";

interface CorrelationHeatmapProps {
  data: CorrelationCell[];
}

// Diverging color: high correlation (errors move together → bad for an ensemble)
// is red; low or negative correlation (independent errors → diversification) is green.
function corrColor(c: number): string {
  const x = Math.max(-1, Math.min(1, c));
  const t = (x + 1) / 2; // 0..1
  const hue = 150 * (1 - t); // -1 → green (150), +1 → red (0)
  return `hsl(${hue}, 58%, 40%)`;
}

// Why pooling works: if models made the *same* mistakes, averaging wouldn't help.
// This matrix shows the Pearson correlation of per-market forecast errors between
// each pair of models. Greener (lower) = more independent = more ensemble benefit.
export function CorrelationHeatmap({ data }: CorrelationHeatmapProps) {
  // Stable model ordering, restricted to forecasters that actually appear.
  const present = new Set(data.flatMap((d) => [d.a, d.b]));
  const ids = MODELS_ONLY.map((m) => m.id).filter((id) => present.has(id));

  const cellByPair = new Map<string, CorrelationCell>();
  for (const c of data) {
    cellByPair.set(`${c.a}|${c.b}`, c);
  }

  const empty = ids.length === 0;

  // Average off-diagonal correlation, for the summary line.
  const offDiag = data.filter((d) => d.a !== d.b && Number.isFinite(d.corr));
  const avgCorr =
    offDiag.length > 0 ? offDiag.reduce((s, d) => s + d.corr, 0) / offDiag.length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Do models make the same mistakes?</CardTitle>
        <CardDescription>
          Correlation of forecast errors between model pairs — greener means more independent
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
            No resolved forecasts yet.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div
                className="grid gap-1 text-center text-xs"
                style={{ gridTemplateColumns: `120px repeat(${ids.length}, minmax(42px, 1fr))` }}
              >
                {/* Header row */}
                <div />
                {ids.map((id) => {
                  const m = forecasterMeta(id);
                  return (
                    <div key={`h-${id}`} className="pb-1 text-base" title={m.name}>
                      {m.emoji}
                    </div>
                  );
                })}

                {/* Body rows */}
                {ids.map((rowId) => {
                  const rm = forecasterMeta(rowId);
                  return (
                    <div key={`r-${rowId}`} className="contents">
                      <div className="flex items-center gap-1.5 truncate pr-2 text-right">
                        <span className="text-base">{rm.emoji}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{rm.name}</span>
                      </div>
                      {ids.map((colId) => {
                        const cell = cellByPair.get(`${rowId}|${colId}`);
                        const isDiag = rowId === colId;
                        const corr = cell?.corr;
                        const valid = typeof corr === "number" && Number.isFinite(corr);
                        return (
                          <div
                            key={`${rowId}-${colId}`}
                            title={
                              cell
                                ? `${rm.name} × ${forecasterMeta(colId).name}: r=${valid ? corr!.toFixed(2) : "n/a"} (n=${cell.n})`
                                : undefined
                            }
                            className="flex aspect-square items-center justify-center rounded font-mono text-[11px] text-white/90"
                            style={{
                              backgroundColor: isDiag
                                ? "rgba(148,163,184,0.15)"
                                : valid
                                  ? corrColor(corr!)
                                  : "rgba(148,163,184,0.08)",
                            }}
                          >
                            {isDiag ? (
                              <span className="text-muted-foreground">—</span>
                            ) : valid ? (
                              corr!.toFixed(2)
                            ) : (
                              <span className="text-muted-foreground">·</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Independent</span>
                <span className="h-3 w-5 rounded" style={{ backgroundColor: corrColor(-1) }} />
                <span className="h-3 w-5 rounded" style={{ backgroundColor: corrColor(0) }} />
                <span className="h-3 w-5 rounded" style={{ backgroundColor: corrColor(1) }} />
                <span>Identical</span>
              </div>
              <span>
                Avg pairwise error correlation:{" "}
                <span className="font-mono text-foreground">{avgCorr.toFixed(2)}</span>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
