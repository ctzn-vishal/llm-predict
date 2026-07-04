import { queryAll } from "./db";
import { clampProb, invLogit, logit } from "./aggregators";
import { forecasterMeta, MODELS_ONLY } from "./models";

// ---------------------------------------------------------------------------
// Research findings computed live from the settled `forecasts` table.
//
// Everything here is a BACKTEST on data the arena has already collected: the
// same market-rounds, the same stored crowd price at forecast time, the same
// model probabilities. The `hybrid` forecaster on the leaderboard is the
// out-of-sample continuation of the winning strategy below.
// ---------------------------------------------------------------------------

const MODEL_IDS = new Set(MODELS_ONLY.map((m) => m.id));

interface SettledRow {
  round_id: string;
  market_id: string;
  forecaster_id: string;
  forecaster_kind: string;
  prob_yes: number;
  crowd_price: number | null;
  outcome: number;
  created_at: string;
}

/** One market-round with every valid model forecast plus the crowd price. */
interface MarketCase {
  logitCrowd: number;
  logitMeanModels: number;
  meanModels: number; // plain probability mean (the live `ensemble` rule)
  outcome: number;
  createdAt: string;
}

export interface BiasRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  avgPred: number;
  actualYes: number;
  n: number;
}

export interface ReliabilityBin {
  bucket: string;
  midpoint: number;
  modelsPred: number | null;
  modelsActual: number | null;
  modelsN: number;
  crowdPred: number | null;
  crowdActual: number | null;
  crowdN: number;
}

export interface StrategyRow {
  key: string;
  label: string;
  brier: number;
  desc: string;
}

export interface SweepPoint {
  w: number; // weight on the crowd price
  brier: number;
}

export interface DivergenceBucket {
  label: string;
  n: number;
  modelWins: number;
  crowdWins: number;
}

export interface RegimeRow {
  label: string;
  n: number;
  crowd: number;
  pool: number;
  hybrid: number;
}

export interface Insights {
  nSettledForecasts: number;
  nCases: number;
  bias: BiasRow[];
  reliability: ReliabilityBin[];
  strategies: StrategyRow[];
  sweep: SweepPoint[];
  divergence: DivergenceBucket[];
  regimes: RegimeRow[];
  crowdBrier: number;
  hybridBacktestBrier: number;
  // Live out-of-sample tracking of the hybrid forecaster (settled rows only).
  liveHybridN: number;
  liveHybridBrier: number | null;
  liveCrowdBrierShared: number | null;
}

async function fetchSettled(): Promise<SettledRow[]> {
  return queryAll<SettledRow>(
    `SELECT round_id, market_id, forecaster_id, forecaster_kind,
            prob_yes, crowd_price, outcome, created_at
     FROM forecasts
     WHERE settled = 1 AND ok = 1 AND outcome IS NOT NULL AND prob_yes IS NOT NULL
     ORDER BY created_at`,
  );
}

function buildCases(rows: SettledRow[]): MarketCase[] {
  const groups = new Map<string, SettledRow[]>();
  for (const r of rows) {
    if (!MODEL_IDS.has(r.forecaster_id)) continue;
    const k = `${r.round_id}|${r.market_id}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const cases: MarketCase[] = [];
  for (const g of groups.values()) {
    // Need a real consensus (3+ valid models) and a stored price to compare to.
    if (g.length < 3 || g[0].crowd_price == null) continue;
    const logits = g.map((r) => logit(r.prob_yes));
    cases.push({
      logitCrowd: logit(g[0].crowd_price),
      logitMeanModels: logits.reduce((s, l) => s + l, 0) / logits.length,
      meanModels: g.reduce((s, r) => s + r.prob_yes, 0) / g.length,
      outcome: g[0].outcome,
      createdAt: g[0].created_at,
    });
  }
  cases.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return cases;
}

function brierOf(cases: MarketCase[], f: (c: MarketCase) => number): number {
  if (cases.length === 0) return 0;
  return cases.reduce((s, c) => s + (f(c) - c.outcome) ** 2, 0) / cases.length;
}

function reliabilityBins(rows: SettledRow[]): ReliabilityBin[] {
  const model = Array.from({ length: 10 }, () => ({ p: 0, y: 0, n: 0 }));
  const crowd = Array.from({ length: 10 }, () => ({ p: 0, y: 0, n: 0 }));
  for (const r of rows) {
    const target = MODEL_IDS.has(r.forecaster_id)
      ? model
      : r.forecaster_id === "crowd"
        ? crowd
        : null;
    if (!target) continue;
    const b = Math.min(9, Math.floor(clampProb(r.prob_yes) * 10));
    target[b].p += r.prob_yes;
    target[b].y += r.outcome;
    target[b].n += 1;
  }
  return model.map((m, i) => {
    const c = crowd[i];
    return {
      bucket: `${i * 10}–${i * 10 + 10}%`,
      midpoint: i / 10 + 0.05,
      modelsPred: m.n ? m.p / m.n : null,
      modelsActual: m.n ? m.y / m.n : null,
      modelsN: m.n,
      crowdPred: c.n ? c.p / c.n : null,
      crowdActual: c.n ? c.y / c.n : null,
      crowdN: c.n,
    };
  });
}

export async function getInsights(): Promise<Insights> {
  const rows = await fetchSettled();
  const cases = buildCases(rows);

  // -- 1. The skeptic bias: mean predicted P(YES) vs realized YES rate --------
  const biasAgg = new Map<string, { p: number; y: number; n: number }>();
  for (const r of rows) {
    if (!MODEL_IDS.has(r.forecaster_id) && r.forecaster_id !== "crowd") continue;
    const a = biasAgg.get(r.forecaster_id) ?? { p: 0, y: 0, n: 0 };
    a.p += r.prob_yes;
    a.y += r.outcome;
    a.n += 1;
    biasAgg.set(r.forecaster_id, a);
  }
  const bias: BiasRow[] = [...biasAgg.entries()]
    .map(([id, a]) => {
      const meta = forecasterMeta(id);
      return {
        id,
        name: meta.name,
        emoji: meta.emoji,
        color: meta.color,
        avgPred: a.p / a.n,
        actualYes: a.y / a.n,
        n: a.n,
      };
    })
    .sort((a, b) => a.avgPred - b.avgPred);

  // -- 2. Aggregation strategies, backtested on identical market-rounds -------
  const crowdBrier = brierOf(cases, (c) => invLogit(c.logitCrowd));
  const hybridBacktestBrier = brierOf(cases, (c) =>
    invLogit(0.8 * c.logitCrowd + 0.2 * c.logitMeanModels),
  );
  const strategies: StrategyRow[] = [
    {
      key: "mean",
      label: "Mean pool",
      brier: brierOf(cases, (c) => c.meanModels),
      desc: "Plain average of the model probabilities (the live Ensemble rule).",
    },
    {
      key: "logit",
      label: "Logit pool",
      brier: brierOf(cases, (c) => invLogit(c.logitMeanModels)),
      desc: "Average in log-odds space (geometric mean of odds).",
    },
    {
      key: "extremized",
      label: "Extremized ×1.3",
      brier: brierOf(cases, (c) => invLogit(1.3 * c.logitMeanModels)),
      desc: "The classic superforecasting trick: push the pooled forecast away from 0.5.",
    },
    {
      key: "shrunk",
      label: "Shrunk ×0.5",
      brier: brierOf(cases, (c) => invLogit(0.5 * c.logitMeanModels)),
      desc: "The opposite: pull the pooled forecast toward 0.5.",
    },
    {
      key: "crowd",
      label: "Market price",
      brier: crowdBrier,
      desc: "The Polymarket price at forecast time — the bar to clear.",
    },
    {
      key: "hybrid",
      label: "Market × Models",
      brier: hybridBacktestBrier,
      desc: "Logit blend: 80% market price, 20% model consensus.",
    },
  ].sort((a, b) => a.brier - b.brier);

  // -- 3. Blend-weight sweep ---------------------------------------------------
  const sweep: SweepPoint[] = [];
  for (let i = 0; i <= 20; i++) {
    const w = i / 20;
    sweep.push({
      w,
      brier: brierOf(cases, (c) =>
        invLogit(w * c.logitCrowd + (1 - w) * c.logitMeanModels),
      ),
    });
  }

  // -- 4. When models fight the market, who wins? ------------------------------
  const defs = [
    { label: "Agree (<7 pts)", lo: 0, hi: 0.07 },
    { label: "Diverge 7–15 pts", lo: 0.07, hi: 0.15 },
    { label: "Diverge 15+ pts", lo: 0.15, hi: Infinity },
  ];
  const divergence: DivergenceBucket[] = defs.map((d) => ({
    label: d.label,
    n: 0,
    modelWins: 0,
    crowdWins: 0,
  }));
  for (const c of cases) {
    const pm = c.meanModels;
    const pc = invLogit(c.logitCrowd);
    const gap = Math.abs(pm - pc);
    const idx = defs.findIndex((d) => gap >= d.lo && gap < d.hi);
    if (idx < 0) continue;
    const b = divergence[idx];
    b.n += 1;
    const em = Math.abs(pm - c.outcome);
    const ec = Math.abs(pc - c.outcome);
    if (em < ec) b.modelWins += 1;
    else if (ec < em) b.crowdWins += 1;
  }

  // -- 5. Regime check: does the story hold across time halves? ----------------
  const half = Math.floor(cases.length / 2);
  const regimes: RegimeRow[] = (
    [
      { label: "Earlier half", set: cases.slice(0, half) },
      { label: "Later half", set: cases.slice(half) },
    ] as const
  ).map((r) => ({
    label: r.label,
    n: r.set.length,
    crowd: brierOf(r.set, (c) => invLogit(c.logitCrowd)),
    pool: brierOf(r.set, (c) => c.meanModels),
    hybrid: brierOf(r.set, (c) =>
      invLogit(0.8 * c.logitCrowd + 0.2 * c.logitMeanModels),
    ),
  }));

  // -- 6. Live out-of-sample hybrid tracking -----------------------------------
  const liveHybrid = rows.filter((r) => r.forecaster_id === "hybrid");
  const liveMarketRounds = new Set(
    liveHybrid.map((r) => `${r.round_id}|${r.market_id}`),
  );
  const liveCrowdShared = rows.filter(
    (r) =>
      r.forecaster_id === "crowd" &&
      liveMarketRounds.has(`${r.round_id}|${r.market_id}`),
  );
  const liveBrier = (set: SettledRow[]) =>
    set.length
      ? set.reduce((s, r) => s + (r.prob_yes - r.outcome) ** 2, 0) / set.length
      : null;

  return {
    nSettledForecasts: rows.filter((r) => MODEL_IDS.has(r.forecaster_id)).length,
    nCases: cases.length,
    bias,
    reliability: reliabilityBins(rows),
    strategies,
    sweep,
    divergence,
    regimes,
    crowdBrier,
    hybridBacktestBrier,
    liveHybridN: liveHybrid.length,
    liveHybridBrier: liveBrier(liveHybrid),
    liveCrowdBrierShared: liveBrier(liveCrowdShared),
  };
}
