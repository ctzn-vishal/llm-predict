import { queryAll, queryOne, run } from "./db";
import type { ForecastRow, MarketRow } from "./schemas";
import { checkResolution } from "./polymarket";
import { EPS } from "./scoring";

export function calculateBrier(prob: number, outcome: 0 | 1): number {
  return (prob - outcome) ** 2;
}

// Log loss with clamping so a confident-and-wrong forecast gets a large (but
// finite) penalty instead of Infinity.
export function calculateLogLoss(prob: number, outcome: 0 | 1): number {
  const p = Math.min(1 - EPS, Math.max(EPS, prob));
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

export interface SettleResult {
  marketsResolved: number;
  marketsVoided: number;
  forecastsScored: number;
}

/**
 * Settle forecasts whose markets have resolved.
 *
 * For each market with unsettled forecasts we ask Polymarket for resolution:
 *  - resolved YES/NO: every valid forecast on that market is scored (Brier +
 *    log loss), and the row's outcome is recorded. Failed forecasts (ok=0) are
 *    still marked settled, but with NULL scores so they never silently count as
 *    a correct/incorrect prediction.
 *  - voided: the market is marked resolved=3 and all its forecasts are settled
 *    with NULL outcome/scores -- excluded from the leaderboard entirely.
 */
export async function settleForecasts(): Promise<SettleResult> {
  const pending = await queryAll<{ market_id: string }>(
    "SELECT DISTINCT market_id FROM forecasts WHERE settled = 0",
  );
  if (pending.length === 0) {
    return { marketsResolved: 0, marketsVoided: 0, forecastsScored: 0 };
  }

  let marketsResolved = 0;
  let marketsVoided = 0;
  let forecastsScored = 0;

  for (const { market_id } of pending) {
    const market = await queryOne<MarketRow>(
      "SELECT * FROM markets WHERE id = @id",
      { id: market_id },
    );
    if (!market) continue;

    let resolution: Awaited<ReturnType<typeof checkResolution>>;
    try {
      resolution = await checkResolution(market_id);
    } catch {
      continue; // transient API issue -- try again next settle pass
    }
    if (!resolution.resolved || !resolution.outcome) continue;

    // ----- Voided: refund nothing, score nothing. -----
    if (resolution.outcome === "voided") {
      await run(
        "UPDATE markets SET resolved = 3, resolved_at = datetime('now') WHERE id = @id",
        { id: market_id },
      );
      await run(
        `UPDATE forecasts
         SET settled = 1, outcome = NULL, brier = NULL, log_loss = NULL
         WHERE market_id = @market_id AND settled = 0`,
        { market_id },
      );
      marketsVoided += 1;
      continue;
    }

    // ----- Resolved YES / NO. -----
    const y: 0 | 1 = resolution.outcome === "yes" ? 1 : 0;
    await run(
      "UPDATE markets SET resolved = @resolved, resolved_at = datetime('now') WHERE id = @id",
      { resolved: y === 1 ? 1 : 2, id: market_id },
    );

    const rows = await queryAll<ForecastRow>(
      "SELECT * FROM forecasts WHERE market_id = @market_id AND settled = 0",
      { market_id },
    );

    for (const f of rows) {
      if (f.ok === 1 && f.prob_yes != null) {
        await run(
          `UPDATE forecasts
           SET settled = 1, outcome = @outcome, brier = @brier, log_loss = @log_loss
           WHERE id = @id`,
          {
            id: f.id,
            outcome: y,
            brier: calculateBrier(f.prob_yes, y),
            log_loss: calculateLogLoss(f.prob_yes, y),
          },
        );
        forecastsScored += 1;
      } else {
        // Failed forecast: record the outcome for context, but no score.
        await run(
          `UPDATE forecasts
           SET settled = 1, outcome = @outcome, brier = NULL, log_loss = NULL
           WHERE id = @id`,
          { id: f.id, outcome: y },
        );
      }
    }
    marketsResolved += 1;
  }

  // A "settling" cohort is done once none of its forecasts remain unsettled.
  await run(
    `UPDATE cohorts SET status = 'completed'
     WHERE status = 'settling'
       AND NOT EXISTS (
         SELECT 1 FROM forecasts WHERE cohort_id = cohorts.id AND settled = 0
       )`,
  );

  return { marketsResolved, marketsVoided, forecastsScored };
}
