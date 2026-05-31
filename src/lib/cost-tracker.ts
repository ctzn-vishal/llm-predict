import { queryOne, queryAll } from "./db";

// Hard cap on total OpenRouter API spend
const BUDGET_CAP_USD = parseFloat(process.env.BUDGET_CAP_USD ?? "100");

export interface CostSummary {
  total_spent: number;
  budget_cap: number;
  budget_remaining: number;
  budget_pct_used: number;
  is_over_budget: boolean;
  per_model: { model_id: string; display_name: string; cost: number }[];
  per_round: { round_id: string; created_at: string; cost: number }[];
  daily: { date: string; cost: number; cumulative: number }[];
}

/**
 * Get total API spend across all forecasts.
 */
export async function getTotalSpent(): Promise<number> {
  const row = await queryOne<{ total: number }>(
    "SELECT COALESCE(SUM(api_cost), 0) as total FROM forecasts"
  );
  return row?.total ?? 0;
}

/**
 * Check if we can afford another round.
 * Estimates cost of a round at ~$2 (conservative) and checks against remaining budget.
 */
export async function canAffordRound(estimatedCost = 2.0): Promise<boolean> {
  const spent = await getTotalSpent();
  return spent + estimatedCost <= BUDGET_CAP_USD;
}

/**
 * Get the budget cap.
 */
export function getBudgetCap(): number {
  return BUDGET_CAP_USD;
}

/**
 * Get full cost summary for the dashboard.
 */
export async function getCostSummary(): Promise<CostSummary> {
  const totalSpent = await getTotalSpent();

  // Per-forecaster cost breakdown (ensemble/crowd cost $0 by construction)
  const perModel = await queryAll<{ model_id: string; display_name: string; cost: number }>(
    `SELECT f.forecaster_id AS model_id, m.display_name, COALESCE(SUM(f.api_cost), 0) as cost
     FROM forecasts f
     JOIN models m ON m.id = f.forecaster_id
     GROUP BY f.forecaster_id
     ORDER BY cost DESC`
  );

  // Per-round cost
  const perRound = await queryAll<{ round_id: string; created_at: string; cost: number }>(
    `SELECT f.round_id, r.created_at, COALESCE(SUM(f.api_cost), 0) as cost
     FROM forecasts f
     JOIN rounds r ON r.id = f.round_id
     GROUP BY f.round_id
     ORDER BY r.created_at ASC`
  );

  // Daily cost aggregation
  const dailyRaw = await queryAll<{ date: string; cost: number }>(
    `SELECT DATE(f.created_at) as date, COALESCE(SUM(f.api_cost), 0) as cost
     FROM forecasts f
     GROUP BY DATE(f.created_at)
     ORDER BY date ASC`
  );

  // Compute cumulative
  let cumulative = 0;
  const daily = dailyRaw.map((d) => {
    cumulative += d.cost;
    return { date: d.date, cost: d.cost, cumulative };
  });

  return {
    total_spent: totalSpent,
    budget_cap: BUDGET_CAP_USD,
    budget_remaining: Math.max(0, BUDGET_CAP_USD - totalSpent),
    budget_pct_used: BUDGET_CAP_USD > 0 ? (totalSpent / BUDGET_CAP_USD) * 100 : 0,
    is_over_budget: totalSpent >= BUDGET_CAP_USD,
    per_model: perModel,
    per_round: perRound,
    daily,
  };
}
