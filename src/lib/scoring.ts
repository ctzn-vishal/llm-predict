import { queryAll } from "./db";
import type {
  ForecasterStats,
  BrierDecomposition,
  CalibrationBucket,
  CorrelationCell,
  EnsembleSizePoint,
  EnsembleComparison,
  ForecasterKind,
} from "./schemas";
import { MODELS_ONLY, forecasterMeta } from "./models";

// Headline metrics for the redesigned arena: how well-calibrated is each
// forecaster, and does it beat the crowd? Everything is computed from the
// settled `forecasts` table in TypeScript (the data is small and the math --
// Brier decomposition, ECE, error correlation, ensemble subsets -- is far
// clearer here than in SQL).

const EPS = 1e-6;
const MODEL_IDS = MODELS_ONLY.map((m) => m.id);

// ---------------------------------------------------------------------------
// Market difficulty: binary entropy of the crowd price. ~1 bit at 50/50
// (hardest), ~0 near 0/1 (the crowd already knows).
// ---------------------------------------------------------------------------
export function marketDifficulty(yesPrice: number): number {
  if (yesPrice <= 0 || yesPrice >= 1) return 0;
  return -yesPrice * Math.log2(yesPrice) - (1 - yesPrice) * Math.log2(1 - yesPrice);
}

// ---------------------------------------------------------------------------
// Scored rows: settled, valid (ok=1), non-void forecasts with a real outcome.
// ---------------------------------------------------------------------------
interface ScoredRow {
  forecaster_id: string;
  forecaster_kind: ForecasterKind;
  market_id: string;
  prob_yes: number;
  outcome: number; // 0 | 1
  brier: number;
  log_loss: number;
  api_cost: number;
  crowd_price: number | null;
}

async function fetchScoredRows(cohortId?: string): Promise<ScoredRow[]> {
  const where = cohortId ? "AND cohort_id = @cohort_id" : "";
  return queryAll<ScoredRow>(
    `SELECT forecaster_id, forecaster_kind, market_id, prob_yes, outcome,
            brier, log_loss, api_cost, crowd_price
     FROM forecasts
     WHERE settled = 1 AND ok = 1 AND outcome IS NOT NULL
       AND prob_yes IS NOT NULL AND brier IS NOT NULL ${where}`,
    cohortId ? { cohort_id: cohortId } : undefined,
  );
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

// ---------------------------------------------------------------------------
// Brier decomposition: Brier = reliability - resolution + uncertainty.
//   reliability (lower better): calibration gap within each bucket.
//   resolution  (higher better): how much outcomes vary across buckets.
//   uncertainty: base-rate variance (irreducible, same for all forecasters).
// ---------------------------------------------------------------------------
export function decomposeBrier(
  points: { prob: number; outcome: number }[],
  nBuckets = 10,
): BrierDecomposition {
  const N = points.length;
  if (N === 0) return { reliability: 0, resolution: 0, uncertainty: 0 };

  const base = mean(points.map((p) => p.outcome));
  const uncertainty = base * (1 - base);

  const buckets: { f: number[]; o: number[] }[] = Array.from(
    { length: nBuckets },
    () => ({ f: [], o: [] }),
  );
  const size = 1 / nBuckets;
  for (const p of points) {
    let idx = Math.floor(p.prob / size);
    if (idx >= nBuckets) idx = nBuckets - 1;
    if (idx < 0) idx = 0;
    buckets[idx].f.push(p.prob);
    buckets[idx].o.push(p.outcome);
  }

  let reliability = 0;
  let resolution = 0;
  for (const b of buckets) {
    const nk = b.f.length;
    if (!nk) continue;
    const fbar = mean(b.f);
    const obar = mean(b.o);
    reliability += (nk / N) * (fbar - obar) ** 2;
    resolution += (nk / N) * (obar - base) ** 2;
  }
  return { reliability, resolution, uncertainty };
}

function expectedCalibrationError(
  points: { prob: number; outcome: number }[],
  nBuckets = 10,
): number {
  const N = points.length;
  if (!N) return 0;
  const buckets: { f: number[]; o: number[] }[] = Array.from(
    { length: nBuckets },
    () => ({ f: [], o: [] }),
  );
  const size = 1 / nBuckets;
  for (const p of points) {
    let idx = Math.floor(p.prob / size);
    if (idx >= nBuckets) idx = nBuckets - 1;
    if (idx < 0) idx = 0;
    buckets[idx].f.push(p.prob);
    buckets[idx].o.push(p.outcome);
  }
  let ece = 0;
  for (const b of buckets) {
    const nk = b.f.length;
    if (!nk) continue;
    ece += (nk / N) * Math.abs(mean(b.f) - mean(b.o));
  }
  return ece;
}

// Secondary metric: paper P&L from Kelly-staking the forecaster's edge over the
// crowd at crowd odds. The crowd forecaster scores exactly 0 by construction
// (it never disagrees with itself). Clearly labeled as secondary in the UI.
function kellyPaperPnl(rows: ScoredRow[]): number {
  let pnl = 0;
  for (const r of rows) {
    const c = r.crowd_price;
    if (c == null || c <= 0 || c >= 1) continue;
    const p = r.prob_yes;
    const y = r.outcome;
    if (p > c) {
      const f = (p - c) / (1 - c); // Kelly fraction, bet YES at price c
      pnl += y === 1 ? f * (1 / c - 1) : -f;
    } else if (p < c) {
      const f = (c - p) / c; // Kelly fraction, bet NO at price (1-c)
      pnl += y === 0 ? f * (1 / (1 - c) - 1) : -f;
    }
  }
  return pnl * 100;
}

// ---------------------------------------------------------------------------
// Skill leaderboard. One row per forecaster, sorted by Brier (lower = better),
// with forecasters that have no resolved markets sinking to the bottom.
// ---------------------------------------------------------------------------
export async function getLeaderboard(cohortId?: string): Promise<ForecasterStats[]> {
  const scored = await fetchScoredRows(cohortId);

  const where = cohortId ? "WHERE cohort_id = @cohort_id" : "";
  const agg = await queryAll<{
    forecaster_id: string;
    n_total: number;
    n_ok: number;
    total_api_cost: number;
  }>(
    `SELECT forecaster_id, COUNT(*) AS n_total,
            COALESCE(SUM(ok), 0) AS n_ok,
            COALESCE(SUM(api_cost), 0) AS total_api_cost
     FROM forecasts ${where} GROUP BY forecaster_id`,
    cohortId ? { cohort_id: cohortId } : undefined,
  );

  // Crowd Brier per market -> lets us measure skill on each forecaster's own
  // shared set with the crowd.
  const crowdBrierByMarket = new Map<string, number>();
  for (const r of scored) {
    if (r.forecaster_id === "crowd") crowdBrierByMarket.set(r.market_id, r.brier);
  }

  const byForecaster = new Map<string, ScoredRow[]>();
  for (const r of scored) {
    const list = byForecaster.get(r.forecaster_id);
    if (list) list.push(r);
    else byForecaster.set(r.forecaster_id, [r]);
  }

  const ids = new Set<string>([...agg.map((a) => a.forecaster_id), ...byForecaster.keys()]);

  const stats: ForecasterStats[] = [];
  for (const id of ids) {
    const meta = forecasterMeta(id);
    const a = agg.find((x) => x.forecaster_id === id);
    const rows = byForecaster.get(id) ?? [];
    const points = rows.map((r) => ({ prob: r.prob_yes, outcome: r.outcome }));
    const decomp = decomposeBrier(points);

    let skillNum = 0;
    let skillDen = 0;
    for (const r of rows) {
      const cb = crowdBrierByMarket.get(r.market_id);
      if (cb != null) {
        skillNum += cb - r.brier;
        skillDen += 1;
      }
    }

    stats.push({
      forecaster_id: id,
      display_name: meta.name,
      provider: meta.provider,
      avatar_emoji: meta.emoji,
      color: meta.color,
      kind: meta.kind,
      n_total: a?.n_total ?? 0,
      n_resolved: rows.length,
      ok_rate: a && a.n_total > 0 ? a.n_ok / a.n_total : 0,
      brier: mean(rows.map((r) => r.brier)),
      log_loss: mean(rows.map((r) => r.log_loss)),
      calibration_error: expectedCalibrationError(points),
      resolution: decomp.resolution,
      reliability: decomp.reliability,
      skill_vs_crowd: id === "crowd" ? 0 : skillDen > 0 ? skillNum / skillDen : 0,
      avg_prob: mean(rows.map((r) => r.prob_yes)),
      paper_pnl: kellyPaperPnl(rows),
      total_api_cost: a?.total_api_cost ?? 0,
    });
  }

  stats.sort((x, y) => {
    if (x.n_resolved === 0 && y.n_resolved === 0) return 0;
    if (x.n_resolved === 0) return 1;
    if (y.n_resolved === 0) return -1;
    return x.brier - y.brier;
  });
  return stats;
}

// ---------------------------------------------------------------------------
// Calibration curve for one forecaster (or all rows if id omitted).
// ---------------------------------------------------------------------------
export async function getCalibrationCurve(
  forecasterId?: string,
  cohortId?: string,
  nBuckets = 10,
): Promise<CalibrationBucket[]> {
  const scored = await fetchScoredRows(cohortId);
  const rows = forecasterId
    ? scored.filter((r) => r.forecaster_id === forecasterId)
    : scored;
  return buildCalibration(
    rows.map((r) => ({ prob: r.prob_yes, outcome: r.outcome })),
    nBuckets,
  );
}

function buildCalibration(
  points: { prob: number; outcome: number }[],
  nBuckets = 10,
): CalibrationBucket[] {
  const size = 1 / nBuckets;
  const buckets: { f: number[]; o: number[] }[] = Array.from(
    { length: nBuckets },
    () => ({ f: [], o: [] }),
  );
  for (const p of points) {
    let idx = Math.floor(p.prob / size);
    if (idx >= nBuckets) idx = nBuckets - 1;
    if (idx < 0) idx = 0;
    buckets[idx].f.push(p.prob);
    buckets[idx].o.push(p.outcome);
  }
  return buckets.map((b, i) => {
    const low = i * size;
    const high = (i + 1) * size;
    const midpoint = (low + high) / 2;
    const count = b.f.length;
    return {
      bucket: `${Math.round(low * 100)}-${Math.round(high * 100)}%`,
      midpoint,
      avgForecast: count ? mean(b.f) : midpoint,
      winRate: count ? mean(b.o) : midpoint,
      count,
    };
  });
}

// ---------------------------------------------------------------------------
// The "lesson" computations: do many models + an ensemble beat the crowd?
// All three operate on the matrix of per-model forecasts keyed by market.
// ---------------------------------------------------------------------------
interface ModelMatrix {
  // market -> (modelId -> prob)
  probByMarket: Map<string, Map<string, number>>;
  outcomeByMarket: Map<string, number>;
  crowdByMarket: Map<string, number>;
}

function buildModelMatrix(scored: ScoredRow[]): ModelMatrix {
  const probByMarket = new Map<string, Map<string, number>>();
  const outcomeByMarket = new Map<string, number>();
  const crowdByMarket = new Map<string, number>();
  for (const r of scored) {
    outcomeByMarket.set(r.market_id, r.outcome);
    if (r.forecaster_id === "crowd") {
      crowdByMarket.set(r.market_id, r.prob_yes);
    } else if (MODEL_IDS.includes(r.forecaster_id)) {
      let mm = probByMarket.get(r.market_id);
      if (!mm) {
        mm = new Map();
        probByMarket.set(r.market_id, mm);
      }
      mm.set(r.forecaster_id, r.prob_yes);
    }
  }
  return { probByMarket, outcomeByMarket, crowdByMarket };
}

// Markets where ALL models (and optionally the crowd) produced a scored
// forecast -- the apples-to-apples set for ensemble comparisons.
function sharedMarkets(m: ModelMatrix, requireCrowd: boolean): string[] {
  const out: string[] = [];
  for (const [marketId, mm] of m.probByMarket) {
    if (mm.size !== MODEL_IDS.length) continue;
    if (requireCrowd && !m.crowdByMarket.has(marketId)) continue;
    out.push(marketId);
  }
  return out;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...rest] = arr;
  const withHead = combinations(rest, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(rest, k);
  return [...withHead, ...withoutHead];
}

// Pearson correlation of per-market forecast ERRORS (prob - outcome) between
// each pair of models. Low / negative correlations are the reason an ensemble
// helps: independent mistakes cancel.
export async function getErrorCorrelationMatrix(cohortId?: string): Promise<CorrelationCell[]> {
  const scored = await fetchScoredRows(cohortId);
  const { probByMarket, outcomeByMarket } = buildModelMatrix(scored);

  // model -> (market -> error)
  const errByModel = new Map<string, Map<string, number>>();
  for (const id of MODEL_IDS) errByModel.set(id, new Map());
  for (const [marketId, mm] of probByMarket) {
    const y = outcomeByMarket.get(marketId);
    if (y == null) continue;
    for (const [modelId, prob] of mm) {
      errByModel.get(modelId)?.set(marketId, prob - y);
    }
  }

  const cells: CorrelationCell[] = [];
  for (const a of MODEL_IDS) {
    for (const b of MODEL_IDS) {
      const ea = errByModel.get(a)!;
      const eb = errByModel.get(b)!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [marketId, va] of ea) {
        const vb = eb.get(marketId);
        if (vb != null) {
          xs.push(va);
          ys.push(vb);
        }
      }
      cells.push({ a, b, corr: a === b ? 1 : pearson(xs, ys), n: xs.length });
    }
  }
  return cells;
}

// Marginal value of crowd size: mean Brier of a size-k ensemble (averaged over
// all C(6,k) subsets) on the shared market set, vs the mean individual Brier.
export async function getEnsembleSizeCurve(cohortId?: string): Promise<EnsembleSizePoint[]> {
  const scored = await fetchScoredRows(cohortId);
  const m = buildModelMatrix(scored);
  const markets = sharedMarkets(m, false);
  if (markets.length === 0) return [];

  const individualBriers = MODEL_IDS.map((id) =>
    mean(
      markets.map((mk) => {
        const p = m.probByMarket.get(mk)!.get(id)!;
        const y = m.outcomeByMarket.get(mk)!;
        return (p - y) ** 2;
      }),
    ),
  );
  const meanIndividualBrier = mean(individualBriers);

  const points: EnsembleSizePoint[] = [];
  for (let k = 1; k <= MODEL_IDS.length; k++) {
    const subsets = combinations(MODEL_IDS, k);
    const subsetBriers = subsets.map((subset) =>
      mean(
        markets.map((mk) => {
          const mm = m.probByMarket.get(mk)!;
          const ens = mean(subset.map((id) => mm.get(id)!));
          const y = m.outcomeByMarket.get(mk)!;
          return (ens - y) ** 2;
        }),
      ),
    );
    points.push({ size: k, brier: mean(subsetBriers), meanIndividualBrier });
  }
  return points;
}

// The headline comparison: full ensemble vs the average model, the single best
// model, and the crowd -- all on the same shared market set.
export async function getEnsembleComparison(cohortId?: string): Promise<EnsembleComparison> {
  const scored = await fetchScoredRows(cohortId);
  const m = buildModelMatrix(scored);
  const markets = sharedMarkets(m, true);

  const empty: EnsembleComparison = {
    ensembleBrier: 0,
    meanIndividualBrier: 0,
    bestIndividualBrier: 0,
    bestIndividualId: "",
    crowdBrier: 0,
    nMarkets: 0,
  };
  if (markets.length === 0) return empty;

  const ensembleBrier = mean(
    markets.map((mk) => {
      const mm = m.probByMarket.get(mk)!;
      const ens = mean(MODEL_IDS.map((id) => mm.get(id)!));
      const y = m.outcomeByMarket.get(mk)!;
      return (ens - y) ** 2;
    }),
  );

  const perModelBrier = MODEL_IDS.map((id) => ({
    id,
    brier: mean(
      markets.map((mk) => {
        const p = m.probByMarket.get(mk)!.get(id)!;
        const y = m.outcomeByMarket.get(mk)!;
        return (p - y) ** 2;
      }),
    ),
  }));
  const meanIndividualBrier = mean(perModelBrier.map((x) => x.brier));
  const best = perModelBrier.reduce((a, b) => (b.brier < a.brier ? b : a));

  const crowdBrier = mean(
    markets.map((mk) => {
      const c = m.crowdByMarket.get(mk)!;
      const y = m.outcomeByMarket.get(mk)!;
      return (c - y) ** 2;
    }),
  );

  return {
    ensembleBrier,
    meanIndividualBrier,
    bestIndividualBrier: best.brier,
    bestIndividualId: best.id,
    crowdBrier,
    nMarkets: markets.length,
  };
}

export { EPS };
