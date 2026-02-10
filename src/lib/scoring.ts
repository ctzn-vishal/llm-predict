import { queryAll } from "./db";
import type { ModelStats, MarketRow, BrierDecomposition } from "./schemas";
import { detectCorrelation } from "./correlation";

/**
 * Compute market difficulty using binary entropy.
 * Markets near 50/50 are hardest (entropy=1), near 0/1 are easiest (entropy~0).
 */
export function marketDifficulty(yesPrice: number): number {
  if (yesPrice <= 0 || yesPrice >= 1) return 0;
  return -yesPrice * Math.log2(yesPrice) - (1 - yesPrice) * Math.log2(1 - yesPrice);
}

/**
 * Get leaderboard stats for all models, optionally filtered by cohort.
 */
export async function getLeaderboard(cohortId?: string): Promise<ModelStats[]> {
  const cohortFilter = cohortId ? "AND b.cohort_id = @cohort_id" : "";
  const params: Record<string, unknown> = {};
  if (cohortId) params.cohort_id = cohortId;

  const stats = await queryAll<ModelStats>(
    `SELECT
      m.id AS model_id,
      m.display_name,
      m.provider,
      m.avatar_emoji,
      m.color,
      COALESCE(cm.bankroll, 10000) AS bankroll,
      COALESCE(SUM(CASE WHEN b.settled = 1 THEN b.pnl ELSE 0 END), 0) AS total_pnl,
      CASE
        WHEN 10000 = 0 THEN 0
        ELSE COALESCE(SUM(CASE WHEN b.settled = 1 THEN b.pnl ELSE 0 END), 0) / 10000.0 * 100
      END AS roi_pct,
      COALESCE(AVG(CASE WHEN b.settled = 1 AND b.brier_score IS NOT NULL THEN b.brier_score END), 0) AS brier_score,
      COUNT(CASE WHEN b.action != 'pass' THEN 1 END) AS total_bets,
      CASE
        WHEN COUNT(CASE WHEN b.settled = 1 AND b.action != 'pass' AND mk.resolved != 3 THEN 1 END) = 0 THEN 0
        ELSE CAST(COUNT(CASE WHEN b.settled = 1 AND b.pnl > 0 AND mk.resolved != 3 THEN 1 END) AS REAL)
          / COUNT(CASE WHEN b.settled = 1 AND b.action != 'pass' AND mk.resolved != 3 THEN 1 END)
      END AS win_rate,
      CASE
        WHEN COUNT(b.id) = 0 THEN 0
        ELSE CAST(COUNT(CASE WHEN b.action = 'pass' THEN 1 END) AS REAL) / COUNT(b.id)
      END AS pass_rate,
      COALESCE(AVG(CASE WHEN b.action != 'pass' THEN b.confidence END), 0) AS avg_confidence,
      COALESCE(AVG(CASE WHEN b.action != 'pass' THEN b.bet_size_pct END), 0) AS avg_bet_size,
      COALESCE(SUM(b.api_cost), 0) AS total_api_cost,
      0 AS avg_difficulty
    FROM models m
    LEFT JOIN bets b ON b.model_id = m.id ${cohortFilter}
    LEFT JOIN markets mk ON mk.id = b.market_id
    LEFT JOIN cohort_models cm ON cm.model_id = m.id ${cohortId ? "AND cm.cohort_id = @cohort_id" : ""}
    GROUP BY m.id
    ORDER BY total_pnl DESC`,
    params
  );

  // Post-process: compute avg_difficulty from bet market prices
  for (const stat of stats) {
    const bets = await queryAll<{ market_price_at_bet: number }>(
      `SELECT market_price_at_bet FROM bets
       WHERE model_id = @model_id AND action != 'pass'
         AND market_price_at_bet > 0 AND market_price_at_bet < 1
         ${cohortFilter}`,
      { ...params, model_id: stat.model_id }
    );
    if (bets.length > 0) {
      const totalDifficulty = bets.reduce(
        (sum, b) => sum + marketDifficulty(b.market_price_at_bet),
        0
      );
      stat.avg_difficulty = totalDifficulty / bets.length;
    }
  }

  return stats;
}

/**
 * Decompose Brier score into reliability, resolution, and uncertainty.
 * Buckets predictions into deciles and computes the decomposition.
 */
export function decomposeBrier(
  bets: { estimated_probability: number; resolved_yes: boolean }[],
  nBuckets = 10
): BrierDecomposition {
  if (bets.length === 0) {
    return { reliability: 0, resolution: 0, uncertainty: 0 };
  }

  const N = bets.length;

  // Overall base rate
  const overallMean =
    bets.reduce((sum, b) => sum + (b.resolved_yes ? 1 : 0), 0) / N;

  // Uncertainty = overallMean * (1 - overallMean)
  const uncertainty = overallMean * (1 - overallMean);

  // Bucket predictions into deciles
  const bucketSize = 1 / nBuckets;
  const buckets: { forecasts: number[]; outcomes: boolean[] }[] = Array.from(
    { length: nBuckets },
    () => ({ forecasts: [], outcomes: [] })
  );

  for (const bet of bets) {
    let bucketIdx = Math.floor(bet.estimated_probability / bucketSize);
    if (bucketIdx >= nBuckets) bucketIdx = nBuckets - 1;
    buckets[bucketIdx].forecasts.push(bet.estimated_probability);
    buckets[bucketIdx].outcomes.push(bet.resolved_yes);
  }

  let reliability = 0;
  let resolution = 0;

  for (const bucket of buckets) {
    const nk = bucket.forecasts.length;
    if (nk === 0) continue;

    const avgForecast =
      bucket.forecasts.reduce((a, b) => a + b, 0) / nk;
    const avgOutcome =
      bucket.outcomes.reduce((sum, o) => sum + (o ? 1 : 0), 0) / nk;

    // Reliability: (nk/N) * (avgForecast - avgOutcome)^2
    reliability += (nk / N) * (avgForecast - avgOutcome) ** 2;

    // Resolution: (nk/N) * (avgOutcome - overallMean)^2
    resolution += (nk / N) * (avgOutcome - overallMean) ** 2;
  }

  return { reliability, resolution, uncertainty };
}

/**
 * Compute the mean Brier score across a set of bets.
 */
export function aggregateBrierScore(
  bets: { brier_score: number }[]
): number {
  if (bets.length === 0) return 0;
  const sum = bets.reduce((acc, b) => acc + b.brier_score, 0);
  return sum / bets.length;
}

/**
 * Get leaderboard with adjusted P&L that deduplicates correlated market bets.
 * Within each correlation cluster, only the first bet per model counts toward adjusted P&L.
 */
export async function getAdjustedLeaderboard(
  cohortId?: string,
): Promise<(ModelStats & { adjusted_pnl: number })[]> {
  // Get regular leaderboard first
  const stats = await getLeaderboard(cohortId);

  // Get all settled bets with market info
  const cohortFilter = cohortId ? "AND b.cohort_id = @cohort_id" : "";
  const params: Record<string, unknown> = {};
  if (cohortId) params.cohort_id = cohortId;

  const settledBets = await queryAll<{
    model_id: string;
    market_id: string;
    question: string;
    pnl: number;
    created_at: string;
  }>(
    `SELECT b.model_id, b.market_id, mk.question, b.pnl, b.created_at
     FROM bets b
     JOIN markets mk ON mk.id = b.market_id
     WHERE b.settled = 1 AND b.action != 'pass' ${cohortFilter}
     ORDER BY b.created_at ASC`,
    params,
  );

  if (settledBets.length === 0) {
    return stats.map(s => ({ ...s, adjusted_pnl: s.total_pnl }));
  }

  // Build market objects from settled bets for correlation detection
  const marketMap = new Map<string, MarketRow>();
  for (const bet of settledBets) {
    if (!marketMap.has(bet.market_id)) {
      marketMap.set(bet.market_id, {
        id: bet.market_id,
        question: bet.question,
      } as MarketRow);
    }
  }
  const marketList = [...marketMap.values()];

  // Detect correlations
  const clusters = detectCorrelation(marketList);

  // For each model, deduplicate: within each cluster, only count first bet's P&L
  const adjustedPnlByModel = new Map<string, number>();

  for (const stat of stats) {
    const modelBets = settledBets.filter(b => b.model_id === stat.model_id);
    const seenClusters = new Set<string>();
    let adjustedPnl = 0;

    for (const bet of modelBets) {
      const cluster = clusters.get(bet.market_id) ?? `cluster_${bet.market_id}`;
      if (!seenClusters.has(cluster)) {
        seenClusters.add(cluster);
        adjustedPnl += bet.pnl;
      }
    }

    adjustedPnlByModel.set(stat.model_id, adjustedPnl);
  }

  return stats.map(s => ({
    ...s,
    adjusted_pnl: adjustedPnlByModel.get(s.model_id) ?? s.total_pnl,
  }));
}
