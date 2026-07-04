import { nanoid } from "nanoid";
import { queryAll, queryOne, run } from "./db";
import type { CohortRow, ForecasterKind, MarketRow, ModelRow } from "./schemas";
import { forecastMarket } from "./openrouter";
import { HYBRID_CROWD_WEIGHT, hybridProb } from "./aggregators";

export interface RoundResult {
  roundId: string;
  marketCount: number;
  forecastCount: number; // total forecast rows written (models + ensemble + crowd)
  okCount: number;
  failCount: number;
  totalCost: number;
}

// Horizon window for a round, kept in sync with the Gamma-side gate in
// polymarket.ts. We forecast GENUINELY-FUTURE events: at least a day out (so the
// outcome isn't already decided/lookupable) and within ~6 weeks (so the
// forecast -> resolve -> score feedback loop still closes).
const MIN_HORIZON_DAYS = 1;
const MAX_HORIZON_DAYS = 45;
const ONE_DAY_MS = 86_400_000;
// Soft per-category cap within a round, so one hot news cycle can't dominate the
// 12 markets we forecast. Diversity matters for the "independent errors cancel"
// story: a round that is all one topic measures one correlated bet, not breadth.
const MAX_PER_CATEGORY = 3;
// How many markets to forecast concurrently. Each market fans out to the 6
// model forecasters in parallel, so this caps in-flight OpenRouter calls at
// ~MARKET_CONCURRENCY * 6. We keep this at 3: a full 12-market round then runs
// in 4 waves, comfortably under the serverless 300s budget given the 30s
// per-attempt fail-fast in openrouter.ts. Any model that blows the timeout or
// returns unparseable JSON is recorded visibly with ok=0 and excluded from
// scoring rather than coerced to a default.
const MARKET_CONCURRENCY = 3;

/**
 * Pick genuinely-future, unresolved, non-extreme markets for a round. Mirrors
 * the Gamma-side selection in polymarket.ts but operates on cached DB rows: only
 * markets that resolve at least a day out and within ~6 weeks, with a price that
 * leaves room for skill (a near-certain market measures nothing). Sports/weather
 * are already excluded upstream at sync time, so they never reach here.
 */
function selectRoundMarkets(allMarkets: MarketRow[], count = 12): MarketRow[] {
  const now = Date.now();
  const minMs = MIN_HORIZON_DAYS * ONE_DAY_MS;
  const maxMs = MAX_HORIZON_DAYS * ONE_DAY_MS;
  const eligible = allMarkets
    .filter((m) => {
      if (m.resolved !== 0) return false;
      if (m.yes_price == null) return false;
      if (m.yes_price < 0.05 || m.yes_price > 0.95) return false;
      if (!m.end_date) return false;
      const endMs = new Date(m.end_date).getTime();
      if (Number.isNaN(endMs)) return false;
      const horizon = endMs - now;
      if (horizon < minMs || horizon > maxMs) return false;
      return true;
    })
    .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));

  // Soft per-category cap: prefer a spread of topics, but backfill from the
  // held-back overflow so we still return `count` markets when one news cycle
  // dominates the eligible pool. `category` is the parent event's primary tag
  // (persisted at sync); null falls back to a shared "uncategorized" bucket.
  const perCategory = new Map<string, number>();
  const picked: MarketRow[] = [];
  const overflow: MarketRow[] = [];
  for (const m of eligible) {
    if (picked.length >= count) break;
    const cat = m.category ?? "uncategorized";
    const n = perCategory.get(cat) ?? 0;
    if (n >= MAX_PER_CATEGORY) {
      overflow.push(m);
      continue;
    }
    perCategory.set(cat, n + 1);
    picked.push(m);
  }
  for (const m of overflow) {
    if (picked.length >= count) break;
    picked.push(m);
  }
  return picked;
}

interface ForecastInsert {
  roundId: string;
  cohortId: string;
  marketId: string;
  forecasterId: string;
  forecasterKind: ForecasterKind;
  probYes: number | null;
  reasoning: string | null;
  keyFactors: string | null; // JSON-encoded string[]
  crowdPrice: number | null;
  promptText: string | null;
  rawResponse: string | null;
  ok: number; // 1 = valid forecast, 0 = failure (error explains why)
  error: string | null;
  apiCost: number;
  apiLatencyMs: number;
}

// One row per (round, market, forecaster). OR REPLACE keeps a re-run of the same
// round idempotent against the unique (round_id, market_id, forecaster_id) index.
async function insertForecast(f: ForecastInsert): Promise<void> {
  await run(
    `INSERT OR REPLACE INTO forecasts
       (round_id, cohort_id, market_id, forecaster_id, forecaster_kind,
        prob_yes, reasoning, key_factors, crowd_price, prompt_text, raw_response,
        ok, error, api_cost, api_latency_ms, settled, outcome, brier, log_loss)
     VALUES
       (@round_id, @cohort_id, @market_id, @forecaster_id, @forecaster_kind,
        @prob_yes, @reasoning, @key_factors, @crowd_price, @prompt_text, @raw_response,
        @ok, @error, @api_cost, @api_latency_ms, 0, NULL, NULL, NULL)`,
    {
      round_id: f.roundId,
      cohort_id: f.cohortId,
      market_id: f.marketId,
      forecaster_id: f.forecasterId,
      forecaster_kind: f.forecasterKind,
      prob_yes: f.probYes,
      reasoning: f.reasoning,
      key_factors: f.keyFactors,
      crowd_price: f.crowdPrice,
      prompt_text: f.promptText,
      raw_response: f.rawResponse,
      ok: f.ok,
      error: f.error,
      api_cost: f.apiCost,
      api_latency_ms: f.apiLatencyMs,
    },
  );
}

interface MarketTotals {
  forecastCount: number;
  okCount: number;
  failCount: number;
  cost: number;
}

/**
 * Forecast a single market: every model forecaster in parallel, then the three
 * computed forecasters (`ensemble` = mean of valid model probs, `hybrid` =
 * logit blend of market price and model consensus, `crowd` = the Polymarket
 * price). Returns per-market tallies so the caller can aggregate
 * across markets that run concurrently. Failures are stored with ok=0 and an
 * error reason -- never silently coerced into a default.
 */
async function processMarket(
  market: MarketRow,
  roundId: string,
  cohortId: string,
  models: ModelRow[],
): Promise<MarketTotals> {
  const crowdPrice = market.yes_price;
  let forecastCount = 0;
  let okCount = 0;
  let failCount = 0;
  let cost = 0;

  // a. Ask all model forecasters in parallel for a blind probability.
  const results = await Promise.all(
    models.map(async (model) => {
      const r = await forecastMarket(model.openrouter_id, market);
      await insertForecast({
        roundId,
        cohortId,
        marketId: market.id,
        forecasterId: model.id,
        forecasterKind: "model",
        probYes: r.ok ? r.prob : null,
        reasoning: r.reasoning,
        keyFactors: r.keyFactors ? JSON.stringify(r.keyFactors) : null,
        crowdPrice,
        promptText: r.promptText,
        rawResponse: r.raw || null,
        ok: r.ok ? 1 : 0,
        error: r.error,
        apiCost: r.cost,
        apiLatencyMs: r.latencyMs,
      });
      return r;
    }),
  );

  forecastCount += results.length;
  for (const r of results) {
    if (r.ok) okCount += 1;
    else failCount += 1;
    cost += r.cost;
  }

  // b. Ensemble = mean of the VALID model probabilities. If nothing valid,
  //    record the ensemble as a visible failure rather than a fake 0.5.
  const validProbs = results
    .filter((r) => r.ok && r.prob != null)
    .map((r) => r.prob as number);

  if (validProbs.length > 0) {
    const mean = validProbs.reduce((s, p) => s + p, 0) / validProbs.length;
    await insertForecast({
      roundId,
      cohortId,
      marketId: market.id,
      forecasterId: "ensemble",
      forecasterKind: "ensemble",
      probYes: mean,
      reasoning: `Mean of ${validProbs.length}/${models.length} valid model forecasts.`,
      keyFactors: null,
      crowdPrice,
      promptText: null,
      rawResponse: null,
      ok: 1,
      error: null,
      apiCost: 0,
      apiLatencyMs: 0,
    });
    okCount += 1;
  } else {
    await insertForecast({
      roundId,
      cohortId,
      marketId: market.id,
      forecasterId: "ensemble",
      forecasterKind: "ensemble",
      probYes: null,
      reasoning: null,
      keyFactors: null,
      crowdPrice,
      promptText: null,
      rawResponse: null,
      ok: 0,
      error: "no valid member forecasts",
      apiCost: 0,
      apiLatencyMs: 0,
    });
    failCount += 1;
  }
  forecastCount += 1;

  // c. Hybrid = Market × Models. Unlike everything above it is NOT blind: it
  //    anchors on the market price and nudges it with the model consensus in
  //    logit space (see lib/aggregators.ts). Its job is to test, out of
  //    sample, whether the models carry information the market hasn't priced.
  const hybrid = hybridProb(crowdPrice, validProbs);
  await insertForecast({
    roundId,
    cohortId,
    marketId: market.id,
    forecasterId: "hybrid",
    forecasterKind: "ensemble",
    probYes: hybrid,
    reasoning:
      hybrid != null
        ? `Logit blend: ${HYBRID_CROWD_WEIGHT} x market price + ${(1 - HYBRID_CROWD_WEIGHT).toFixed(1)} x consensus of ${validProbs.length}/${models.length} valid model forecasts.`
        : null,
    keyFactors: null,
    crowdPrice,
    promptText: null,
    rawResponse: null,
    ok: hybrid != null ? 1 : 0,
    error:
      hybrid != null
        ? null
        : crowdPrice == null
          ? "no market price"
          : "no valid member forecasts",
    apiCost: 0,
    apiLatencyMs: 0,
  });
  if (hybrid != null) okCount += 1;
  else failCount += 1;
  forecastCount += 1;

  // d. Crowd = the Polymarket price itself -- our baseline to beat.
  const crowdOk = crowdPrice != null;
  await insertForecast({
    roundId,
    cohortId,
    marketId: market.id,
    forecasterId: "crowd",
    forecasterKind: "crowd",
    probYes: crowdPrice,
    reasoning: crowdOk ? "Polymarket implied probability (crowd baseline)." : null,
    keyFactors: null,
    crowdPrice,
    promptText: null,
    rawResponse: null,
    ok: crowdOk ? 1 : 0,
    error: crowdOk ? null : "no market price",
    apiCost: 0,
    apiLatencyMs: 0,
  });
  if (crowdOk) okCount += 1;
  else failCount += 1;
  forecastCount += 1;

  return { forecastCount, okCount, failCount, cost };
}

/**
 * Run one round of BLIND forecasts.
 *
 * Markets are processed in concurrent batches (MARKET_CONCURRENCY). Within each
 * market we ask all model forecasters in parallel for an independent P(YES) --
 * they never see the market price -- then write two synthetic forecasters:
 * `ensemble` (mean of the valid model probs) and `crowd` (the Polymarket price,
 * our baseline to beat). Failures are stored with ok=0 and an error reason --
 * never silently coerced into a default, which was the core bug in the old
 * betting pipeline.
 */
export async function runRound(cohortId: string): Promise<RoundResult> {
  const cohort = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE id = @id AND status = 'active'",
    { id: cohortId },
  );
  if (!cohort) {
    throw new Error(`No active cohort found with id: ${cohortId}`);
  }

  const allMarkets = await queryAll<MarketRow>(
    "SELECT * FROM markets WHERE resolved = 0 ORDER BY volume_24h DESC",
  );
  const selectedMarkets = selectRoundMarkets(allMarkets);
  if (selectedMarkets.length === 0) {
    throw new Error("No short-horizon markets available for this round");
  }
  const selectedIds = selectedMarkets.map((m) => m.id);

  const roundId = nanoid();
  await run(
    "INSERT INTO rounds (id, cohort_id, market_ids, status) VALUES (@id, @cohort_id, @market_ids, @status)",
    {
      id: roundId,
      cohort_id: cohortId,
      market_ids: JSON.stringify(selectedIds),
      status: "in_progress",
    },
  );

  // The 6 live LLM forecasters (ensemble, hybrid and crowd are computed, not called).
  const models = await queryAll<ModelRow>(
    "SELECT * FROM models WHERE id NOT IN ('ensemble', 'hybrid', 'crowd') ORDER BY id",
  );

  // Soft budget guard: stop launching new markets once cumulative spend would
  // exceed the cap. 0 / unset disables the guard.
  const budgetCap = Number(process.env.BUDGET_CAP_USD ?? "0");
  let spentTotal = 0;
  if (budgetCap > 0) {
    const row = await queryOne<{ total: number }>(
      "SELECT COALESCE(SUM(api_cost), 0) AS total FROM forecasts",
    );
    spentTotal = row?.total ?? 0;
  }

  let forecastCount = 0;
  let okCount = 0;
  let failCount = 0;
  let totalCost = 0;
  let stoppedForBudget = false;

  // Process markets in concurrent batches. Re-check the soft budget guard
  // before launching each batch -- granular enough for a spend ceiling, while
  // keeping a full round well within the serverless time budget.
  for (let i = 0; i < selectedMarkets.length; i += MARKET_CONCURRENCY) {
    if (budgetCap > 0 && spentTotal >= budgetCap) {
      stoppedForBudget = true;
      break;
    }
    const batch = selectedMarkets.slice(i, i + MARKET_CONCURRENCY);
    const batchTotals = await Promise.all(
      batch.map((market) => processMarket(market, roundId, cohortId, models)),
    );
    for (const t of batchTotals) {
      forecastCount += t.forecastCount;
      okCount += t.okCount;
      failCount += t.failCount;
      totalCost += t.cost;
      spentTotal += t.cost;
    }
  }

  await run(
    "UPDATE rounds SET status = @status WHERE id = @id",
    { id: roundId, status: stoppedForBudget ? "partial" : "completed" },
  );

  // Cohort market_count = distinct markets the cohort has ever forecast.
  await run(
    `UPDATE cohorts SET market_count = (
      SELECT COUNT(DISTINCT market_id) FROM forecasts WHERE cohort_id = @id
    ) WHERE id = @id`,
    { id: cohortId },
  );

  return {
    roundId,
    marketCount: selectedMarkets.length,
    forecastCount,
    okCount,
    failCount,
    totalCost,
  };
}
