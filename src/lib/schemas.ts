import { z } from "zod";

// === Prediction Response Schema (from LLM) ===
export const PredictionSchema = z.object({
  action: z.enum(["bet_yes", "bet_no", "pass"]),
  confidence: z.number().min(0).max(1),
  bet_size_pct: z.number().min(1).max(25),
  estimated_probability: z.number().min(0).max(1),
  reasoning: z.string(),
  key_factors: z.array(z.string()),
});
export type Prediction = z.infer<typeof PredictionSchema>;

// === OpenRouter Structured Output JSON Schema ===
export const PREDICTION_JSON_SCHEMA = {
  name: "prediction",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      action: { type: "string" as const, enum: ["bet_yes", "bet_no", "pass"] },
      confidence: { type: "number" as const, minimum: 0, maximum: 1 },
      bet_size_pct: { type: "number" as const, minimum: 1, maximum: 25 },
      estimated_probability: { type: "number" as const, minimum: 0, maximum: 1 },
      reasoning: { type: "string" as const },
      key_factors: { type: "array" as const, items: { type: "string" as const } },
    },
    required: [
      "action",
      "confidence",
      "bet_size_pct",
      "estimated_probability",
      "reasoning",
      "key_factors",
    ],
    additionalProperties: false,
  },
};

// === DB Row Types ===
export interface ModelRow {
  id: string;
  display_name: string;
  provider: string;
  openrouter_id: string;
  avatar_emoji: string;
  color: string;
  created_at: string;
}

export interface CohortRow {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  market_count: number;
  created_at: string;
}

export interface CohortModelRow {
  cohort_id: string;
  model_id: string;
  bankroll: number;
}

export interface MarketRow {
  id: string;
  question: string;
  description: string | null;
  slug: string | null;
  condition_id: string | null;
  yes_price: number | null;
  no_price: number | null;
  volume_24h: number | null;
  end_date: string | null;
  resolved: number;
  resolved_at: string | null;
  fetched_at: string;
}

export interface RoundRow {
  id: string;
  cohort_id: string;
  market_ids: string;
  status: string;
  created_at: string;
}

export interface BetRow {
  id: number;
  model_id: string;
  market_id: string;
  cohort_id: string;
  round_id: string;
  action: string;
  confidence: number | null;
  bet_size_pct: number | null;
  bet_amount: number | null;
  estimated_probability: number | null;
  market_price_at_bet: number | null;
  reasoning: string | null;
  key_factors: string | null;
  prompt_text: string | null;
  raw_response: string | null;
  settled: number;
  pnl: number;
  brier_score: number | null;
  api_cost: number;
  api_latency_ms: number;
  created_at: string;
}

// === Polymarket API Types ===
export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  markets: GammaMarket[];
  volume: number;
  startDate: string;
  endDate: string;
}

export interface GammaMarket {
  id: number;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string;
  volume: number;
  volume24hr: number;
  active: boolean;
  closed: boolean;
  endDateIso: string;
  description: string;
}

// === Leaderboard Stats ===
export interface ModelStats {
  model_id: string;
  display_name: string;
  provider: string;
  avatar_emoji: string;
  color: string;
  bankroll: number;
  total_pnl: number;
  roi_pct: number;
  brier_score: number;
  total_bets: number;
  win_rate: number;
  pass_rate: number;
  avg_confidence: number;
  avg_bet_size: number;
  total_api_cost: number;
  avg_difficulty: number;
  resolved_bets: number;
  initial_bankroll: number;
}

// === Brier Decomposition ===
export interface BrierDecomposition {
  reliability: number;
  resolution: number;
  uncertainty: number;
}
