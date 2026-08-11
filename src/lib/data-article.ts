import { queryAll, queryOne } from "./db";
import { hybridProb, logit, invLogit } from "./aggregators";
import { forecasterMeta, MODELS_ONLY } from "./models";

// ---------------------------------------------------------------------------
// Analytics for the /data article.
//
// Deliberately DISJOINT from lib/insights.ts (which answers "how should we
// aggregate?") and lib/scoring.ts (which powers the leaderboard). This module
// asks the questions a reader has *about the dataset itself*:
//
//   * how big is it, what did it cost, what is it made of        -> corpus
//   * which topics are hard, and where do the models help        -> byCategory
//   * does lead time change the picture                          -> byHorizon
//   * is model disagreement a usable difficulty signal           -> bySpread
//   * how reliable is the machinery that produced all this       -> ops
//   * how much of the headline edge survives sampling noise      -> intervals
//
// Every scored comparison is built from the same `MarketCase` set, so the
// crowd, the ensemble and the hybrid are always measured on identical
// market-rounds -- the only way a Brier comparison means anything.
// ---------------------------------------------------------------------------

const MODEL_IDS = MODELS_ONLY.map((m) => m.id);
const MODEL_ID_SET = new Set(MODEL_IDS);

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface ScoredJoinRow {
  round_id: string;
  market_id: string;
  forecaster_id: string;
  prob_yes: number;
  crowd_price: number | null;
  outcome: number;
  created_at: string;
  category: string | null;
  end_date: string | null;
}

/** One market-round: every valid model forecast plus the crowd price. */
interface MarketCase {
  key: string;
  category: string;
  horizonDays: number | null;
  crowd: number;
  /** Probabilities in arbitrary order -- for means, spread, pooling. */
  models: number[];
  /** The same probabilities keyed by forecaster, for per-model comparisons. */
  probByModel: Map<string, number>;
  meanModels: number;
  hybrid: number;
  outcome: number;
}

export interface CorpusStats {
  nForecasts: number;
  nModelForecasts: number;
  nSettled: number;
  nMarkets: number;
  nMarketsResolved: number;
  nRounds: number;
  nCohorts: number;
  nCategories: number;
  firstForecast: string | null;
  lastForecast: string | null;
  totalCost: number;
  costPerMarketRound: number;
  yesRate: number;
  nCases: number;
}

export interface CategoryRow {
  category: string;
  n: number;
  crowd: number;
  ensemble: number;
  hybrid: number;
  bestModel: number;
  yesRate: number;
  /** crowd Brier − hybrid Brier. Positive = the models added something here. */
  hybridEdge: number;
}

export interface HorizonRow {
  label: string;
  n: number;
  crowd: number;
  ensemble: number;
  hybrid: number;
  avgDays: number;
}

export interface SpreadRow {
  label: string;
  n: number;
  avgSpread: number;
  crowd: number;
  ensemble: number;
  /** How far the model consensus sat from the price in this bucket. */
  avgGapToPrice: number;
}

export interface OpsRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  nCalls: number;
  nOk: number;
  okRate: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  avgCost: number;
  totalCost: number;
  costPerScored: number;
}

export interface FailureRow {
  reason: string;
  n: number;
  share: number;
}

export interface IntervalRow {
  label: string;
  /** Distinguishes a rule replayed over all history from the live forecaster. */
  sub: string;
  /** Mean per-market Brier advantage over the crowd (positive = better). */
  diff: number;
  lo: number;
  hi: number;
  n: number;
  significant: boolean;
}

export interface LeadLagRow {
  label: string;
  sub: string;
  diff: number; // the OLS slope (named `diff` so it shares the forest plot)
  lo: number;
  hi: number;
  n: number;
  nMarkets: number;
  significant: boolean;
}

export interface LeadLag {
  /** Share of round-to-round transitions where the stored price did not change. */
  stalePct: number;
  nTransitions: number;
  rows: LeadLagRow[];
  truth: LeadLagRow | null;
  bootstrapSamples: number;
}

export interface LeakStratum {
  label: string;
  n: number;
  ensemble: number;
  crowd: number;
  skill: number;
}

export interface Leakage {
  nForecasts: number;
  nLeaked: number;
  leakPct: number;
  perModel: { id: string; name: string; emoji: string; color: string; n: number; leak: number; pct: number }[];
  /** Within-market: mean(|leaky − price|) − mean(|clean − price|). Negative = pulled toward the price. */
  withinDiff: number;
  withinLo: number;
  withinHi: number;
  withinMarkets: number;
  withinGroups: number;
  withinSignificant: boolean;
  /** Share landing within half a point of the price, vs a shuffled-price baseline. */
  copyPct: number;
  copyBaselinePct: number;
  strata: LeakStratum[];
}

export interface DataArticle {
  corpus: CorpusStats;
  leadLag: LeadLag | null;
  leakage: Leakage | null;
  byCategory: CategoryRow[];
  byHorizon: HorizonRow[];
  bySpread: SpreadRow[];
  ops: OpsRow[];
  failures: FailureRow[];
  intervals: IntervalRow[];
  bootstrapSamples: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function brier(p: number, y: number): number {
  return (p - y) ** 2;
}

/**
 * SQLite `datetime('now')` yields "YYYY-MM-DD HH:MM:SS" with no zone marker,
 * which Date parses as *local* time. Normalise to UTC so horizons computed
 * against Polymarket's ISO end dates are not off by the server's offset.
 */
function parseDbTime(s: string | null): number | null {
  if (!s) return null;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Population standard deviation -- the spread of the six model opinions. */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Case construction
// ---------------------------------------------------------------------------

async function fetchScoredJoin(): Promise<ScoredJoinRow[]> {
  return queryAll<ScoredJoinRow>(
    `SELECT f.round_id, f.market_id, f.forecaster_id, f.prob_yes, f.crowd_price,
            f.outcome, f.created_at, m.category, m.end_date
     FROM forecasts f
     LEFT JOIN markets m ON m.id = f.market_id
     WHERE f.settled = 1 AND f.ok = 1 AND f.outcome IS NOT NULL AND f.prob_yes IS NOT NULL
     ORDER BY f.created_at`,
  );
}

function buildCases(rows: ScoredJoinRow[]): MarketCase[] {
  const groups = new Map<string, ScoredJoinRow[]>();
  for (const r of rows) {
    if (!MODEL_ID_SET.has(r.forecaster_id)) continue;
    const k = `${r.round_id}|${r.market_id}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const cases: MarketCase[] = [];
  for (const [key, g] of groups) {
    // Same bar as the Findings page: a real consensus (3+ models) and a stored
    // price to compare against.
    const head = g[0];
    const crowd = head.crowd_price;
    if (g.length < 3 || crowd == null) continue;
    const models = g.map((r) => r.prob_yes);
    const h = hybridProb(crowd, models);
    if (h == null) continue;

    const madeAt = parseDbTime(head.created_at);
    const endsAt = head.end_date ? new Date(head.end_date).getTime() : NaN;
    const horizonDays =
      madeAt != null && Number.isFinite(endsAt)
        ? (endsAt - madeAt) / 86_400_000
        : null;

    cases.push({
      key,
      category: head.category ?? "uncategorized",
      horizonDays,
      crowd,
      models,
      probByModel: new Map(g.map((r) => [r.forecaster_id, r.prob_yes])),
      meanModels: mean(models),
      hybrid: h,
      outcome: head.outcome,
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// 1. Corpus overview
// ---------------------------------------------------------------------------

async function getCorpus(cases: MarketCase[]): Promise<CorpusStats> {
  const totals = await queryOne<{
    n_forecasts: number;
    n_settled: number;
    total_cost: number;
    first_at: string | null;
    last_at: string | null;
    n_rounds: number;
  }>(
    `SELECT COUNT(*) AS n_forecasts,
            COALESCE(SUM(settled), 0) AS n_settled,
            COALESCE(SUM(api_cost), 0) AS total_cost,
            MIN(created_at) AS first_at,
            MAX(created_at) AS last_at,
            COUNT(DISTINCT round_id) AS n_rounds
     FROM forecasts`,
  );

  const modelCount = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM forecasts WHERE forecaster_kind = 'model'`,
  );

  const markets = await queryOne<{ n: number; n_resolved: number; n_cat: number }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(resolved), 0) AS n_resolved,
            COUNT(DISTINCT category) AS n_cat
     FROM markets`,
  );

  const cohorts = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM cohorts`);

  const totalCost = totals?.total_cost ?? 0;
  return {
    nForecasts: totals?.n_forecasts ?? 0,
    nModelForecasts: modelCount?.n ?? 0,
    nSettled: totals?.n_settled ?? 0,
    nMarkets: markets?.n ?? 0,
    nMarketsResolved: markets?.n_resolved ?? 0,
    nRounds: totals?.n_rounds ?? 0,
    nCohorts: cohorts?.n ?? 0,
    nCategories: markets?.n_cat ?? 0,
    firstForecast: totals?.first_at ?? null,
    lastForecast: totals?.last_at ?? null,
    totalCost,
    costPerMarketRound: cases.length ? totalCost / cases.length : 0,
    yesRate: mean(cases.map((c) => c.outcome)),
    nCases: cases.length,
  };
}

// ---------------------------------------------------------------------------
// 2. Which topics are hard, and where do the models help?
// ---------------------------------------------------------------------------

const MIN_CATEGORY_N = 8;

function getByCategory(cases: MarketCase[]): CategoryRow[] {
  const groups = new Map<string, MarketCase[]>();
  for (const c of cases) {
    const g = groups.get(c.category);
    if (g) g.push(c);
    else groups.set(c.category, [c]);
  }

  // Categories too thin to say anything about are pooled rather than dropped,
  // so the row counts still add up to the full sample.
  const thin: MarketCase[] = [];
  const rows: CategoryRow[] = [];
  for (const [category, set] of groups) {
    if (set.length < MIN_CATEGORY_N) {
      thin.push(...set);
      continue;
    }
    rows.push(categoryRow(category, set));
  }
  if (thin.length > 0) {
    rows.push(categoryRow(`other (${groups.size - rows.length} small topics)`, thin));
  }
  return rows.sort((a, b) => b.crowd - a.crowd);
}

function categoryRow(category: string, set: MarketCase[]): CategoryRow {
  const crowd = mean(set.map((c) => brier(c.crowd, c.outcome)));
  const hybrid = mean(set.map((c) => brier(c.hybrid, c.outcome)));
  // Best single model on this slice, using only the cases each model answered.
  // Models with too few answers here are skipped rather than flattered by a
  // lucky handful.
  const perModel = MODEL_IDS.map((id) => {
    const answered = set.filter((c) => c.probByModel.has(id));
    if (answered.length < Math.max(3, set.length * 0.5)) return null;
    return mean(answered.map((c) => brier(c.probByModel.get(id) as number, c.outcome)));
  }).filter((v): v is number => v != null);
  return {
    category,
    n: set.length,
    crowd,
    ensemble: mean(set.map((c) => brier(c.meanModels, c.outcome))),
    hybrid,
    bestModel: perModel.length ? Math.min(...perModel) : 0,
    yesRate: mean(set.map((c) => c.outcome)),
    hybridEdge: crowd - hybrid,
  };
}

// ---------------------------------------------------------------------------
// 3. Lead time
// ---------------------------------------------------------------------------

const HORIZON_BUCKETS = [
  { label: "1–3 days", lo: 0, hi: 3 },
  { label: "3–7 days", lo: 3, hi: 7 },
  { label: "1–2 weeks", lo: 7, hi: 14 },
  { label: "2–6 weeks", lo: 14, hi: Infinity },
];

function getByHorizon(cases: MarketCase[]): HorizonRow[] {
  return HORIZON_BUCKETS.map((b) => {
    const set = cases.filter(
      (c) => c.horizonDays != null && c.horizonDays >= b.lo && c.horizonDays < b.hi,
    );
    return {
      label: b.label,
      n: set.length,
      avgDays: mean(set.map((c) => c.horizonDays as number)),
      crowd: mean(set.map((c) => brier(c.crowd, c.outcome))),
      ensemble: mean(set.map((c) => brier(c.meanModels, c.outcome))),
      hybrid: mean(set.map((c) => brier(c.hybrid, c.outcome))),
    };
  }).filter((r) => r.n > 0);
}

// ---------------------------------------------------------------------------
// 4. Is disagreement among the models a usable signal?
// ---------------------------------------------------------------------------

const SPREAD_BUCKETS = [
  { label: "tight (<5 pts)", lo: 0, hi: 0.05 },
  { label: "5–12 pts", lo: 0.05, hi: 0.12 },
  { label: "12–20 pts", lo: 0.12, hi: 0.2 },
  { label: "wide (20+ pts)", lo: 0.2, hi: Infinity },
];

function getBySpread(cases: MarketCase[]): SpreadRow[] {
  return SPREAD_BUCKETS.map((b) => {
    const set = cases.filter((c) => {
      const s = stdev(c.models);
      return s >= b.lo && s < b.hi;
    });
    return {
      label: b.label,
      n: set.length,
      avgSpread: mean(set.map((c) => stdev(c.models))),
      crowd: mean(set.map((c) => brier(c.crowd, c.outcome))),
      ensemble: mean(set.map((c) => brier(c.meanModels, c.outcome))),
      avgGapToPrice: mean(set.map((c) => Math.abs(c.meanModels - c.crowd))),
    };
  }).filter((r) => r.n > 0);
}

// ---------------------------------------------------------------------------
// 5. Operational reality: reliability, latency, unit cost
// ---------------------------------------------------------------------------

async function getOps(): Promise<{ ops: OpsRow[]; failures: FailureRow[] }> {
  const agg = await queryAll<{
    forecaster_id: string;
    n_calls: number;
    n_ok: number;
    total_cost: number;
  }>(
    `SELECT forecaster_id, COUNT(*) AS n_calls,
            COALESCE(SUM(ok), 0) AS n_ok,
            COALESCE(SUM(api_cost), 0) AS total_cost
     FROM forecasts WHERE forecaster_kind = 'model'
     GROUP BY forecaster_id`,
  );

  const scoredCounts = await queryAll<{ forecaster_id: string; n: number }>(
    `SELECT forecaster_id, COUNT(*) AS n FROM forecasts
     WHERE forecaster_kind = 'model' AND settled = 1 AND ok = 1 AND outcome IS NOT NULL
     GROUP BY forecaster_id`,
  );
  const scoredBy = new Map(scoredCounts.map((r) => [r.forecaster_id, r.n]));

  // Latency distribution needs the raw values; two small integers per row keeps
  // this cheap even after tens of thousands of calls.
  const lat = await queryAll<{ forecaster_id: string; api_latency_ms: number }>(
    `SELECT forecaster_id, api_latency_ms FROM forecasts
     WHERE forecaster_kind = 'model' AND ok = 1 AND api_latency_ms > 0`,
  );
  const latBy = new Map<string, number[]>();
  for (const r of lat) {
    const l = latBy.get(r.forecaster_id);
    if (l) l.push(r.api_latency_ms);
    else latBy.set(r.forecaster_id, [r.api_latency_ms]);
  }
  for (const arr of latBy.values()) arr.sort((a, b) => a - b);

  const ops: OpsRow[] = MODEL_IDS.map((id) => {
    const a = agg.find((x) => x.forecaster_id === id);
    const meta = forecasterMeta(id);
    const ls = latBy.get(id) ?? [];
    const nCalls = a?.n_calls ?? 0;
    const nOk = a?.n_ok ?? 0;
    const totalCost = a?.total_cost ?? 0;
    const nScored = scoredBy.get(id) ?? 0;
    return {
      id,
      name: meta.name,
      emoji: meta.emoji,
      color: meta.color,
      nCalls,
      nOk,
      okRate: nCalls > 0 ? nOk / nCalls : 0,
      p50LatencyMs: percentile(ls, 0.5),
      p90LatencyMs: percentile(ls, 0.9),
      avgCost: nCalls > 0 ? totalCost / nCalls : 0,
      totalCost,
      costPerScored: nScored > 0 ? totalCost / nScored : 0,
    };
  }).sort((a, b) => b.okRate - a.okRate);

  // Failure taxonomy. Raw error strings embed provider bodies and status codes,
  // so they are collapsed into the handful of modes that actually differ in how
  // you would fix them.
  const errs = await queryAll<{ error: string | null; n: number }>(
    `SELECT error, COUNT(*) AS n FROM forecasts
     WHERE forecaster_kind = 'model' AND ok = 0
     GROUP BY error`,
  );
  const buckets = new Map<string, number>();
  let totalFail = 0;
  for (const e of errs) {
    const raw = (e.error ?? "").toLowerCase();
    let reason = "other";
    if (raw.includes("timeout")) reason = "timed out (30s)";
    else if (raw.includes("unparseable")) reason = "unparseable JSON";
    else if (raw.includes("empty response")) reason = "empty response";
    else if (raw.includes("429") || raw.includes("rate")) reason = "rate limited";
    else if (/http 5\d\d/.test(raw)) reason = "provider 5xx";
    else if (/http 4\d\d/.test(raw)) reason = "request rejected (4xx)";
    else if (raw.includes("api_key")) reason = "missing API key";
    buckets.set(reason, (buckets.get(reason) ?? 0) + e.n);
    totalFail += e.n;
  }
  const failures: FailureRow[] = [...buckets.entries()]
    .map(([reason, n]) => ({ reason, n, share: totalFail ? n / totalFail : 0 }))
    .sort((a, b) => b.n - a.n);

  return { ops, failures };
}

// ---------------------------------------------------------------------------
// 6. How much of the edge survives sampling noise?
//
// A paired bootstrap over market-rounds. Pairing matters: the crowd and the
// hybrid are scored on the SAME markets, so the interesting quantity is the
// per-market difference, whose variance is far smaller than either Brier's.
//
// The PRNG is a fixed-seed LCG rather than Math.random so the page renders the
// same interval on every request for a given dataset -- a confidence interval
// that flickers on reload teaches the wrong lesson.
// ---------------------------------------------------------------------------

const BOOTSTRAP_SAMPLES = 2000;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bootstrapCI(diffs: number[], samples = BOOTSTRAP_SAMPLES): { lo: number; hi: number } {
  const n = diffs.length;
  if (n < 2) return { lo: 0, hi: 0 };
  const rng = makeRng(0x5eed);
  const means: number[] = [];
  for (let b = 0; b < samples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += diffs[(rng() * n) | 0];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  return {
    lo: means[Math.floor(0.05 * samples)],
    hi: means[Math.floor(0.95 * samples)],
  };
}

function intervalFrom(label: string, sub: string, diffs: number[]): IntervalRow {
  const { lo, hi } = bootstrapCI(diffs);
  return {
    label,
    sub,
    diff: mean(diffs),
    lo,
    hi,
    n: diffs.length,
    significant: diffs.length > 1 && (lo > 0 || hi < 0),
  };
}

function getIntervals(cases: MarketCase[], rows: ScoredJoinRow[]): IntervalRow[] {
  // (a) Aggregation RULES replayed over every settled market-round. This mixes
  //     the period the 0.8 weight was tuned on with everything after it, so it
  //     is a backtest and is labelled as one.
  const defs: { label: string; p: (c: MarketCase) => number }[] = [
    { label: "Market × Models rule (80/20 logit blend)", p: (c) => c.hybrid },
    { label: "Ensemble — plain mean of the 6 models", p: (c) => c.meanModels },
    {
      label: "Logit pool of the 6 models",
      p: (c) => invLogit(mean(c.models.map((m) => logit(m)))),
    },
  ];
  const out = defs.map((d) =>
    intervalFrom(
      d.label,
      "rule replayed over all settled history — backtest",
      // Positive = the forecaster beat the crowd on that market.
      cases.map((c) => brier(c.crowd, c.outcome) - brier(d.p(c), c.outcome)),
    ),
  );

  // (b) The LIVE hybrid forecaster: the rows actually written at forecast time,
  //     paired against the crowd row for the same market-round. This is the only
  //     genuinely out-of-sample number on the page, so it gets its own line
  //     rather than being folded into the backtest above.
  const liveHybrid = new Map<string, number>();
  const liveCrowd = new Map<string, number>();
  const liveOutcome = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.round_id}|${r.market_id}`;
    if (r.forecaster_id === "hybrid") liveHybrid.set(k, r.prob_yes);
    else if (r.forecaster_id === "crowd") liveCrowd.set(k, r.prob_yes);
    else continue;
    liveOutcome.set(k, r.outcome);
  }
  const liveDiffs: number[] = [];
  for (const [k, h] of liveHybrid) {
    const cp = liveCrowd.get(k);
    const y = liveOutcome.get(k);
    if (cp == null || y == null) continue;
    liveDiffs.push(brier(cp, y) - brier(h, y));
  }
  if (liveDiffs.length > 1) {
    out.push(
      intervalFrom(
        "Market × Models, live rows only",
        "made after the weight was fixed — out of sample",
        liveDiffs,
      ),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// 7. Lead-lag: does the model consensus predict where the price goes next?
//
// The naive version of this test produces a positive, significant slope and a
// very appealing headline. It is an artifact. Our `markets.yes_price` is only
// refreshed for markets that still pass the top-N volume gate at sync time, so
// a market can be forecast against a price captured rounds earlier. When that
// stale snapshot finally updates, it jumps toward reality -- and a model that
// just ran a live web search "predicts" that jump trivially.
//
// So the slope is reported three ways: pooled, and split by whether the price
// at time t was itself fresh. Only the FRESH row can support a claim that the
// models lead the actual market.
// ---------------------------------------------------------------------------

const LEADLAG_SAMPLES = 1000;

interface PathPoint {
  t: string;
  price: number;
  models: number[];
}

interface Obs {
  market: string;
  x: number;
  y: number;
}

function olsSlope(obs: Obs[]): number | null {
  const n = obs.length;
  if (n < 3) return null;
  const mx = mean(obs.map((o) => o.x));
  const my = mean(obs.map((o) => o.y));
  let sxy = 0;
  let sxx = 0;
  for (const o of obs) {
    sxy += (o.x - mx) * (o.y - my);
    sxx += (o.x - mx) ** 2;
  }
  return sxx === 0 ? null : sxy / sxx;
}

/**
 * Block bootstrap resampling whole MARKETS. Observations inside one market
 * share an outcome and a price path, so resampling individual rows would
 * understate the interval badly.
 */
function slopeCI(obs: Obs[], samples: number): { lo: number; hi: number; nMarkets: number } | null {
  const byMarket = new Map<string, Obs[]>();
  for (const o of obs) {
    const g = byMarket.get(o.market);
    if (g) g.push(o);
    else byMarket.set(o.market, [o]);
  }
  const blocks = [...byMarket.values()];
  if (blocks.length < 4) return null;
  const rng = makeRng(0xc0ffee);
  const slopes: number[] = [];
  for (let b = 0; b < samples; b++) {
    const s: Obs[] = [];
    for (let i = 0; i < blocks.length; i++) s.push(...blocks[(rng() * blocks.length) | 0]);
    const sl = olsSlope(s);
    if (sl != null) slopes.push(sl);
  }
  if (slopes.length < 10) return null;
  slopes.sort((a, b) => a - b);
  return {
    lo: slopes[Math.floor(0.025 * slopes.length)],
    hi: slopes[Math.floor(0.975 * slopes.length)],
    nMarkets: blocks.length,
  };
}

function leadLagRow(label: string, sub: string, obs: Obs[]): LeadLagRow | null {
  const slope = olsSlope(obs);
  if (slope == null) return null;
  const ci = slopeCI(obs, LEADLAG_SAMPLES);
  return {
    label,
    sub,
    diff: slope,
    lo: ci?.lo ?? 0,
    hi: ci?.hi ?? 0,
    n: obs.length,
    nMarkets: ci?.nMarkets ?? 0,
    significant: ci ? ci.lo > 0 || ci.hi < 0 : false,
  };
}

async function getLeadLag(): Promise<LeadLag | null> {
  // Deliberately NOT restricted to settled rows -- the price path exists
  // whether or not the market has resolved yet.
  const rows = await queryAll<{
    market_id: string;
    round_id: string;
    forecaster_id: string;
    prob_yes: number;
    outcome: number | null;
    settled: number;
    created_at: string;
  }>(
    `SELECT market_id, round_id, forecaster_id, prob_yes, outcome, settled, created_at
     FROM forecasts
     WHERE ok = 1 AND prob_yes IS NOT NULL AND crowd_price IS NOT NULL
     ORDER BY market_id, created_at`,
  );

  const byMarket = new Map<string, Map<string, PathPoint>>();
  const outcomeByMarket = new Map<string, number>();
  for (const r of rows) {
    let m = byMarket.get(r.market_id);
    if (!m) {
      m = new Map();
      byMarket.set(r.market_id, m);
    }
    let p = m.get(r.round_id);
    if (!p) {
      p = { t: r.created_at, price: NaN, models: [] };
      m.set(r.round_id, p);
    }
    if (r.forecaster_id === "crowd") p.price = r.prob_yes;
    else if (MODEL_ID_SET.has(r.forecaster_id)) p.models.push(r.prob_yes);
    if (r.settled === 1 && r.outcome != null) outcomeByMarket.set(r.market_id, r.outcome);
  }

  const stale: Obs[] = [];
  const fresh: Obs[] = [];
  const pooled: Obs[] = [];
  const truth: Obs[] = [];
  let nTransitions = 0;
  let nUnchanged = 0;

  for (const [marketId, m] of byMarket) {
    const seq = [...m.values()]
      .filter((p) => Number.isFinite(p.price))
      .sort((a, b) => (a.t < b.t ? -1 : 1));

    for (let i = 0; i < seq.length; i++) {
      const cur = seq[i];
      if (cur.models.length < 3) continue;
      const consensus = mean(cur.models);
      const x = consensus - cur.price;

      if (i + 1 < seq.length) {
        if (i > 0) nTransitions += 1;
        const y = seq[i + 1].price - cur.price;
        const obs: Obs = { market: marketId, x, y };
        pooled.push(obs);
        if (i > 0) {
          const wasFresh = Math.abs(cur.price - seq[i - 1].price) > 1e-9;
          if (wasFresh) fresh.push(obs);
          else {
            stale.push(obs);
            nUnchanged += 1;
          }
        }
      }

      const out = outcomeByMarket.get(marketId);
      if (out != null) truth.push({ market: marketId, x, y: out - cur.price });
    }
  }

  if (pooled.length < 20) return null;

  const built = [
    leadLagRow(
      "All transitions, pooled",
      "the naive test — mixes fresh and stale prices",
      pooled,
    ),
    leadLagRow(
      "Price at t was STALE",
      "unchanged since the previous round — our cache, not the market",
      stale,
    ),
    leadLagRow(
      "Price at t was FRESH",
      "had moved since the previous round — the only honest test",
      fresh,
    ),
  ].filter((r): r is LeadLagRow => r != null);

  return {
    stalePct: nTransitions ? nUnchanged / nTransitions : 0,
    nTransitions,
    rows: built,
    truth: leadLagRow(
      "Does disagreement point at the truth?",
      "y = outcome − price, over resolved markets",
      truth,
    ),
    bootstrapSamples: LEADLAG_SAMPLES,
  };
}

// ---------------------------------------------------------------------------
// 8. Price leakage: are the "blind" forecasts actually blind?
//
// The prompt withholds the market price, but the models run a live web search,
// and Exa indexes Polymarket, Kalshi and the sites that quote them. So a model
// can read the price it was never told. This measures how often that happens
// and what it does to the numbers.
//
// The load-bearing test is WITHIN-MARKET: on the same market, in the same
// round, against the same price, do the forecasts whose reasoning cites market
// odds sit closer to that price than the ones that don't? Comparing leaky and
// clean forecasts across different markets would confound leakage with
// difficulty; holding the market fixed removes that entirely.
// ---------------------------------------------------------------------------

// Names a venue or explicitly cites market-implied odds. Deliberately narrow:
// "stock market" and "market cap" must not match, or the rate is meaningless.
//
// Evaluated in SQL rather than in JS: the alternative is shipping ~10k rows of
// reasoning prose out of Turso on every request, which dominated the page's
// load time. These LIKE patterns are exactly the literal alternatives of the
// original regex.
const LEAK_TERMS = [
  "polymarket", "kalshi", "metaculus", "predictit", "betfair", "smarkets",
  "prediction market", "betting market", "implied probabilit",
  "market-implied", "market implied", "bookmaker", "betting odds", "wagering",
];
const LEAK_SQL = `(${LEAK_TERMS.map(
  (t) => `lower(coalesce(reasoning,'') || ' ' || coalesce(key_factors,'')) LIKE '%${t}%'`,
).join(" OR ")})`;

const COPY_EPS = 0.005; // "the same number as the price", to half a point

interface LeakRow {
  round_id: string;
  market_id: string;
  forecaster_id: string;
  prob_yes: number;
  crowd_price: number;
  leak: number; // 1/0, computed in SQL
  settled: number;
  outcome: number | null;
}

async function getLeakage(): Promise<Leakage | null> {
  const raw = await queryAll<LeakRow>(
    `SELECT round_id, market_id, forecaster_id, prob_yes, crowd_price, settled, outcome,
            CASE WHEN ${LEAK_SQL} THEN 1 ELSE 0 END AS leak
     FROM forecasts
     WHERE ok = 1 AND forecaster_kind = 'model'
       AND prob_yes IS NOT NULL AND crowd_price IS NOT NULL`,
  );
  if (raw.length < 50) return null;

  const rows = raw.map((r) => ({
    ...r,
    leak: r.leak === 1,
    dist: Math.abs(r.prob_yes - r.crowd_price),
  }));

  const nLeaked = rows.filter((r) => r.leak).length;

  const perModelMap = new Map<string, { n: number; leak: number }>();
  for (const r of rows) {
    const g = perModelMap.get(r.forecaster_id) ?? { n: 0, leak: 0 };
    g.n += 1;
    if (r.leak) g.leak += 1;
    perModelMap.set(r.forecaster_id, g);
  }
  const perModel = [...perModelMap.entries()]
    .map(([id, g]) => {
      const meta = forecasterMeta(id);
      return { id, name: meta.name, emoji: meta.emoji, color: meta.color, n: g.n, leak: g.leak, pct: g.leak / g.n };
    })
    .sort((a, b) => b.pct - a.pct);

  // --- within-market paired comparison ---
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.round_id}|${r.market_id}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const paired: { market: string; diff: number }[] = [];
  for (const [k, g] of groups) {
    const lk = g.filter((r) => r.leak);
    const cl = g.filter((r) => !r.leak);
    if (!lk.length || !cl.length) continue;
    paired.push({
      market: k.split("|")[1],
      diff: mean(lk.map((r) => r.dist)) - mean(cl.map((r) => r.dist)),
    });
  }

  let withinDiff = 0;
  let withinLo = 0;
  let withinHi = 0;
  let withinMarkets = 0;
  if (paired.length >= 5) {
    withinDiff = mean(paired.map((p) => p.diff));
    const byMkt = new Map<string, typeof paired>();
    for (const p of paired) {
      const a = byMkt.get(p.market);
      if (a) a.push(p);
      else byMkt.set(p.market, [p]);
    }
    const blocks = [...byMkt.values()];
    withinMarkets = blocks.length;
    if (blocks.length >= 4) {
      const rng = makeRng(0x1ea71);
      const ms: number[] = [];
      for (let b = 0; b < 2000; b++) {
        const s: { market: string; diff: number }[] = [];
        for (let i = 0; i < blocks.length; i++) s.push(...blocks[(rng() * blocks.length) | 0]);
        ms.push(mean(s.map((p) => p.diff)));
      }
      ms.sort((a, b) => a - b);
      withinLo = ms[Math.floor(0.025 * ms.length)];
      withinHi = ms[Math.floor(0.975 * ms.length)];
    }
  }

  // --- outright copying, against a shuffled-price chance baseline ---
  const nCopy = rows.filter((r) => r.dist <= COPY_EPS).length;
  const prices = rows.map((r) => r.crowd_price);
  let nChance = 0;
  for (let i = 0; i < rows.length; i++) {
    // Deterministic stride pairs each forecast with an unrelated market's price.
    if (Math.abs(rows[i].prob_yes - prices[(i * 7919 + 13) % prices.length]) <= COPY_EPS) nChance += 1;
  }

  // --- does the arena's headline gap depend on leakage? ---
  const stratum = (label: string, keep: (g: typeof rows) => boolean): LeakStratum | null => {
    const cases: { ens: number; crowd: number }[] = [];
    for (const [, g] of groups) {
      const s = g.filter((r) => r.settled === 1 && r.outcome != null);
      if (s.length < 3 || !keep(s)) continue;
      const y = s[0].outcome as number;
      cases.push({
        ens: (mean(s.map((r) => r.prob_yes)) - y) ** 2,
        crowd: (s[0].crowd_price - y) ** 2,
      });
    }
    if (cases.length < 5) return null;
    const ensemble = mean(cases.map((c) => c.ens));
    const crowd = mean(cases.map((c) => c.crowd));
    return { label, n: cases.length, ensemble, crowd, skill: crowd - ensemble };
  };

  const strata = [
    stratum("No model cited a market", (g) => g.every((r) => !r.leak)),
    stratum("Some did, some didn't", (g) => g.some((r) => r.leak) && g.some((r) => !r.leak)),
    stratum("Every model cited a market", (g) => g.every((r) => r.leak)),
  ].filter((s): s is LeakStratum => s != null);

  return {
    nForecasts: rows.length,
    nLeaked,
    leakPct: nLeaked / rows.length,
    perModel,
    withinDiff,
    withinLo,
    withinHi,
    withinMarkets,
    withinGroups: paired.length,
    withinSignificant: paired.length >= 5 && (withinLo > 0 || withinHi < 0),
    copyPct: nCopy / rows.length,
    copyBaselinePct: nChance / rows.length,
    strata,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function getDataArticle(): Promise<DataArticle> {
  const rows = await fetchScoredJoin();
  const cases = buildCases(rows);
  const [corpus, { ops, failures }, leadLag, leakage] = await Promise.all([
    getCorpus(cases),
    getOps(),
    getLeadLag(),
    getLeakage(),
  ]);

  return {
    corpus,
    leadLag,
    leakage,
    byCategory: getByCategory(cases),
    byHorizon: getByHorizon(cases),
    bySpread: getBySpread(cases),
    ops,
    failures,
    intervals: getIntervals(cases, rows),
    bootstrapSamples: BOOTSTRAP_SAMPLES,
  };
}
