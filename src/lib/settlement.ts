import { queryAll, queryOne, run } from "./db";
import type { BetRow, MarketRow } from "./schemas";
import { checkResolution } from "./polymarket";

/**
 * Calculate P&L for a settled bet.
 * bet_yes + resolved_yes: betAmount * (1/marketPrice - 1)
 * bet_yes + resolved_no:  -betAmount
 * bet_no  + resolved_no:  betAmount * (1/(1-marketPrice) - 1)
 * bet_no  + resolved_yes: -betAmount
 * pass: 0
 */
export function calculatePnL(
  action: string,
  betAmount: number | null,
  marketPriceAtBet: number | null,
  resolvedOutcome: "yes" | "no"
): number {
  if (action === "pass" || betAmount == null || marketPriceAtBet == null) {
    return 0;
  }

  if (action === "bet_yes") {
    if (resolvedOutcome === "yes") {
      return betAmount * (1 / marketPriceAtBet - 1);
    } else {
      return -betAmount;
    }
  }

  if (action === "bet_no") {
    if (resolvedOutcome === "no") {
      return betAmount * (1 / (1 - marketPriceAtBet) - 1);
    } else {
      return -betAmount;
    }
  }

  return 0;
}

/**
 * Calculate Brier score for a single prediction.
 * (estimatedProbability - actual)^2 where actual = 1 for yes, 0 for no
 */
export function calculateBrierScore(
  estimatedProbability: number,
  resolvedOutcome: "yes" | "no"
): number {
  const actual = resolvedOutcome === "yes" ? 1 : 0;
  return (estimatedProbability - actual) ** 2;
}

export interface SettleResult {
  settled: number;
}

/**
 * Settle all unresolved markets and update bet P&L and Brier scores.
 */
export async function settleMarkets(): Promise<SettleResult> {
  // a. Query all unsettled bets (settled = 0, action != 'pass')
  const unsettledBets = await queryAll<BetRow>(
    "SELECT * FROM bets WHERE settled = 0 AND action != 'pass'"
  );

  if (unsettledBets.length === 0) {
    return { settled: 0 };
  }

  // b. Get unique market IDs from those bets
  const marketIds = [...new Set(unsettledBets.map((b) => b.market_id))];

  let settledCount = 0;

  // c. For each market, check resolution
  for (const marketId of marketIds) {
    const market = await queryOne<MarketRow>(
      "SELECT * FROM markets WHERE id = @id",
      { id: marketId }
    );
    if (!market) continue;

    const resolution = await checkResolution(marketId);
    if (!resolution || !resolution.resolved || !resolution.outcome) continue;

    // Handle voided markets
    if (resolution.outcome === "voided") {
      // Mark market as voided (resolved = 3)
      await run(
        "UPDATE markets SET resolved = 3, resolved_at = datetime('now') WHERE id = @id",
        { id: marketId }
      );

      // For each active bet on this market: settle with pnl=0, refund bet_amount
      const marketBets = unsettledBets.filter((b) => b.market_id === marketId);
      for (const bet of marketBets) {
        await run(
          "UPDATE bets SET settled = 1, pnl = 0, brier_score = NULL WHERE id = @id",
          { id: bet.id }
        );

        // Refund the original bet_amount to bankroll
        if (bet.bet_amount != null) {
          await run(
            "UPDATE cohort_models SET bankroll = bankroll + @amount WHERE cohort_id = @cohort_id AND model_id = @model_id",
            { amount: bet.bet_amount, cohort_id: bet.cohort_id, model_id: bet.model_id }
          );
        }

        settledCount++;
      }

      // Settle pass bets on this voided market
      await run(
        "UPDATE bets SET settled = 1, pnl = 0, brier_score = NULL WHERE market_id = @market_id AND action = 'pass' AND settled = 0",
        { market_id: marketId }
      );

      continue;
    }

    const resolvedOutcome = resolution.outcome;
    const resolvedValue = resolvedOutcome === "yes" ? 1 : 2;

    // d. Update markets table
    await run(
      "UPDATE markets SET resolved = @resolved, resolved_at = datetime('now') WHERE id = @id",
      { resolved: resolvedValue, id: marketId }
    );

    // e. For each bet on this market
    const marketBets = unsettledBets.filter((b) => b.market_id === marketId);
    for (const bet of marketBets) {
      // Calculate P&L
      const pnl = calculatePnL(
        bet.action,
        bet.bet_amount,
        bet.market_price_at_bet,
        resolvedOutcome
      );

      // Calculate Brier score
      const brierScore =
        bet.estimated_probability != null
          ? calculateBrierScore(bet.estimated_probability, resolvedOutcome)
          : null;

      // Update bet
      await run(
        "UPDATE bets SET settled = 1, pnl = @pnl, brier_score = @brier_score WHERE id = @id",
        { pnl, brier_score: brierScore, id: bet.id }
      );

      // Add P&L back to bankroll (winnings added, losses already deducted at bet time)
      await run(
        "UPDATE cohort_models SET bankroll = bankroll + @pnl WHERE cohort_id = @cohort_id AND model_id = @model_id",
        { pnl, cohort_id: bet.cohort_id, model_id: bet.model_id }
      );

      settledCount++;
    }

    // Settle pass bets on this resolved market
    await run(
      "UPDATE bets SET settled = 1, pnl = 0, brier_score = NULL WHERE market_id = @market_id AND action = 'pass' AND settled = 0",
      { market_id: marketId }
    );
  }

  // f. Check if any "settling" cohorts can be marked "completed"
  await run(
    `UPDATE cohorts SET status = 'completed'
     WHERE status = 'settling'
     AND NOT EXISTS (SELECT 1 FROM bets WHERE cohort_id = cohorts.id AND settled = 0)`
  );

  return { settled: settledCount };
}
