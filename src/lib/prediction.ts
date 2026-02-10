import { nanoid } from "nanoid";
import { queryAll, queryOne, run } from "./db";
import type {
  BetRow,
  CohortRow,
  CohortModelRow,
  MarketRow,
  ModelRow,
} from "./schemas";
import { callModel, buildPrompt, type PreviousBetContext } from "./openrouter";

export interface RoundResult {
  roundId: string;
  bets: BetRow[];
}

/**
 * Select 10-20 unresolved markets from the DB cache for a round.
 * Picks markets with decent volume and prices not too extreme.
 */
function selectRoundMarkets(allMarkets: MarketRow[], count = 15): MarketRow[] {
  return allMarkets
    .filter((m) => {
      if (m.resolved !== 0) return false;
      if (m.yes_price != null && (m.yes_price < 0.05 || m.yes_price > 0.95)) return false;
      return true;
    })
    .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0))
    .slice(0, count);
}

export async function runRound(cohortId: string): Promise<RoundResult> {
  // a. Get active cohort from DB
  const cohort = await queryOne<CohortRow>(
    "SELECT * FROM cohorts WHERE id = @id AND status = 'active'",
    { id: cohortId }
  );
  if (!cohort) {
    throw new Error(`No active cohort found with id: ${cohortId}`);
  }

  // b. Get all cached markets, pick 10-20 for this round
  const allMarkets = await queryAll<MarketRow>(
    "SELECT * FROM markets WHERE resolved = 0 ORDER BY volume_24h DESC"
  );
  const selectedMarkets = selectRoundMarkets(allMarkets);
  if (selectedMarkets.length === 0) {
    throw new Error("No markets available for this round");
  }
  const selectedIds = selectedMarkets.map((m) => m.id);

  // c. Create round record
  const roundId = nanoid();
  await run(
    "INSERT INTO rounds (id, cohort_id, market_ids, status) VALUES (@id, @cohort_id, @market_ids, @status)",
    {
      id: roundId,
      cohort_id: cohortId,
      market_ids: JSON.stringify(selectedIds),
      status: "in_progress",
    }
  );

  // d. Get all 6 models
  const models = await queryAll<ModelRow>("SELECT * FROM models WHERE id != 'ensemble'");

  // e. For each market, process all models in parallel
  const allBets: BetRow[] = [];

  for (const market of selectedMarkets) {
    const modelResults = await Promise.all(
      models.map(async (model) => {
        // Get current bankroll
        const cohortModel = await queryOne<CohortModelRow>(
          "SELECT * FROM cohort_models WHERE cohort_id = @cohort_id AND model_id = @model_id",
          { cohort_id: cohortId, model_id: model.id }
        );
        const bankroll = cohortModel?.bankroll ?? 10000;

        // Call the model via OpenRouter
        let action = "pass";
        let confidence: number | null = null;
        let betSizePct: number | null = null;
        let betAmount: number | null = null;
        let estimatedProbability: number | null = null;
        let reasoning: string | null = null;
        let keyFactors: string | null = null;
        let promptText: string | null = buildPrompt(market);
        let rawResponse: string | null = null;
        let apiCost = 0;
        let apiLatencyMs = 0;

        const previousBets = await queryAll<PreviousBetContext>(
          `SELECT action, market_price_at_bet, estimated_probability, confidence, created_at
           FROM bets WHERE model_id = @model_id AND market_id = @market_id AND cohort_id = @cohort_id
           ORDER BY created_at DESC LIMIT 3`,
          { model_id: model.id, market_id: market.id, cohort_id: cohortId }
        );

        try {
          const result = await callModel(model.openrouter_id, market, previousBets);
          rawResponse = result.rawResponse;
          apiCost = result.cost;
          apiLatencyMs = result.latencyMs;

          if (result.prediction) {
            action = result.prediction.action;
            confidence = result.prediction.confidence;
            betSizePct = result.prediction.bet_size_pct;
            estimatedProbability = result.prediction.estimated_probability;
            reasoning = result.prediction.reasoning;
            keyFactors = JSON.stringify(result.prediction.key_factors);

            // Calculate bet amount and deduct from bankroll
            if (action === "bet_yes" || action === "bet_no") {
              betAmount = bankroll * (betSizePct! / 100);
              await run(
                "UPDATE cohort_models SET bankroll = bankroll - @amount WHERE cohort_id = @cohort_id AND model_id = @model_id",
                {
                  amount: betAmount,
                  cohort_id: cohortId,
                  model_id: model.id,
                }
              );
            }
          }
          // else: prediction was null (parse failure) -- forced pass
        } catch {
          // API failure -- forced pass
        }

        // Insert bet record
        const insertResult = await run(
          `INSERT INTO bets (model_id, market_id, cohort_id, round_id, action, confidence, bet_size_pct, bet_amount, estimated_probability, market_price_at_bet, reasoning, key_factors, prompt_text, raw_response, settled, pnl, brier_score, api_cost, api_latency_ms)
           VALUES (@model_id, @market_id, @cohort_id, @round_id, @action, @confidence, @bet_size_pct, @bet_amount, @estimated_probability, @market_price_at_bet, @reasoning, @key_factors, @prompt_text, @raw_response, 0, 0, NULL, @api_cost, @api_latency_ms)`,
          {
            model_id: model.id,
            market_id: market.id,
            cohort_id: cohortId,
            round_id: roundId,
            action,
            confidence,
            bet_size_pct: betSizePct,
            bet_amount: betAmount,
            estimated_probability: estimatedProbability,
            market_price_at_bet: market.yes_price,
            reasoning,
            key_factors: keyFactors,
            prompt_text: promptText,
            raw_response: rawResponse,
            api_cost: apiCost,
            api_latency_ms: apiLatencyMs,
          }
        );

        return {
          id: Number(insertResult.lastInsertRowid),
          model_id: model.id,
          market_id: market.id,
          cohort_id: cohortId,
          round_id: roundId,
          action,
          confidence,
          bet_size_pct: betSizePct,
          bet_amount: betAmount,
          estimated_probability: estimatedProbability,
          market_price_at_bet: market.yes_price,
          reasoning,
          key_factors: keyFactors,
          prompt_text: promptText,
          raw_response: rawResponse,
          settled: 0,
          pnl: 0,
          brier_score: null,
          api_cost: apiCost,
          api_latency_ms: apiLatencyMs,
          created_at: new Date().toISOString(),
        } satisfies BetRow;
      })
    );

    allBets.push(...modelResults);

    // Compute ensemble prediction
    const nonPassBets = modelResults.filter(b => b.action === 'bet_yes' || b.action === 'bet_no');
    if (nonPassBets.length > 0) {
      const yesBets = nonPassBets.filter(b => b.action === 'bet_yes');
      const noBets = nonPassBets.filter(b => b.action === 'bet_no');

      // Majority vote
      let ensembleAction: string;
      if (yesBets.length > noBets.length) {
        ensembleAction = 'bet_yes';
      } else if (noBets.length > yesBets.length) {
        ensembleAction = 'bet_no';
      } else {
        ensembleAction = 'pass'; // tie = pass
      }

      // Mean estimated probability
      const avgProb = nonPassBets.reduce((sum, b) => sum + (b.estimated_probability ?? 0), 0) / nonPassBets.length;
      const avgConfidence = nonPassBets.reduce((sum, b) => sum + (b.confidence ?? 0), 0) / nonPassBets.length;
      const avgBetSizePct = nonPassBets.reduce((sum, b) => sum + (b.bet_size_pct ?? 0), 0) / nonPassBets.length;

      const passCount = modelResults.filter(b => b.action === 'pass').length;
      const ensembleReasoning = `Ensemble of ${modelResults.length} models: ${yesBets.length} bet YES, ${noBets.length} bet NO, ${passCount} passed. Avg probability: ${avgProb.toFixed(3)}`;

      // Get ensemble bankroll
      const ensembleCM = await queryOne<CohortModelRow>(
        "SELECT * FROM cohort_models WHERE cohort_id = @cohort_id AND model_id = 'ensemble'",
        { cohort_id: cohortId }
      );
      const ensembleBankroll = ensembleCM?.bankroll ?? 10000;

      let ensembleBetAmount: number | null = null;
      if (ensembleAction === 'bet_yes' || ensembleAction === 'bet_no') {
        ensembleBetAmount = ensembleBankroll * (avgBetSizePct / 100);
        await run(
          "UPDATE cohort_models SET bankroll = bankroll - @amount WHERE cohort_id = @cohort_id AND model_id = 'ensemble'",
          { amount: ensembleBetAmount, cohort_id: cohortId }
        );
      }

      const ensembleInsert = await run(
        `INSERT INTO bets (model_id, market_id, cohort_id, round_id, action, confidence, bet_size_pct, bet_amount, estimated_probability, market_price_at_bet, reasoning, key_factors, prompt_text, raw_response, settled, pnl, brier_score, api_cost, api_latency_ms)
         VALUES ('ensemble', @market_id, @cohort_id, @round_id, @action, @confidence, @bet_size_pct, @bet_amount, @estimated_probability, @market_price_at_bet, @reasoning, NULL, NULL, NULL, 0, 0, NULL, 0, 0)`,
        {
          market_id: market.id,
          cohort_id: cohortId,
          round_id: roundId,
          action: ensembleAction,
          confidence: avgConfidence,
          bet_size_pct: avgBetSizePct,
          bet_amount: ensembleBetAmount,
          estimated_probability: avgProb,
          market_price_at_bet: market.yes_price,
          reasoning: ensembleReasoning,
        }
      );

      allBets.push({
        id: Number(ensembleInsert.lastInsertRowid),
        model_id: 'ensemble',
        market_id: market.id,
        cohort_id: cohortId,
        round_id: roundId,
        action: ensembleAction,
        confidence: avgConfidence,
        bet_size_pct: avgBetSizePct,
        bet_amount: ensembleBetAmount,
        estimated_probability: avgProb,
        market_price_at_bet: market.yes_price,
        reasoning: ensembleReasoning,
        key_factors: null,
        prompt_text: null,
        raw_response: null,
        settled: 0,
        pnl: 0,
        brier_score: null,
        api_cost: 0,
        api_latency_ms: 0,
        created_at: new Date().toISOString(),
      } satisfies BetRow);
    }
  }

  // f. Update round status to 'completed'
  await run("UPDATE rounds SET status = 'completed' WHERE id = @id", {
    id: roundId,
  });

  // Update cohort market count
  await run(
    "UPDATE cohorts SET market_count = market_count + @count WHERE id = @id",
    { count: selectedMarkets.length, id: cohortId }
  );

  // g. Return round data with all bets
  return { roundId, bets: allBets };
}
