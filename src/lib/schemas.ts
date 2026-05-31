import { z } from "zod";

// ===========================================================================
// Blind forecast response (from the LLM). Models are NOT shown the market
// price -- they return an independent probability that the event resolves YES.
// ===========================================================================
export const ForecastSchema = z.object({
  probability_yes: z.number().min(0).max(1),
  reasoning: z.string(),
  key_factors: z.array(z.string()),
});
export type Forecast = z.infer<typeof ForecastSchema>;

// OpenRouter structured-output JSON schema for the blind forecast.
export const FORECAST_JSON_SCHEMA = {
  name: "forecast",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      probability_yes: { type: "number" as const, minimum: 0, maximum: 1 },
      reasoning: { type: "string" as const },
      key_factors: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["probability_yes", "reasoning", "key_factors"],
    additionalProperties: false,
  },
};

// ===========================================================================
// DB row types
// ===========================================================================
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
  category: string | null; // primary topic tag from the parent event (drives round topic-diversity)
  resolved: number; // 0=open, 1=resolved_yes, 2=resolved_no, 3=voided
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

export type ForecasterKind = "model" | "ensemble" | "crowd";

export interface ForecastRow {
  id: number;
  round_id: string;
  cohort_id: string;
  market_id: string;
  forecaster_id: string;
  forecaster_kind: ForecasterKind;
  prob_yes: number | null;
  reasoning: string | null;
  key_factors: string | null;
  crowd_price: number | null;
  prompt_text: string | null;
  raw_response: string | null;
  ok: number;
  error: string | null;
  api_cost: number;
  api_latency_ms: number;
  settled: number;
  outcome: number | null; // 1=yes, 0=no
  brier: number | null;
  log_loss: number | null;
  created_at: string;
}

// Legacy betting table (pre-2026-05 redesign). Kept for archival only.
export interface BetRow {
  id: number;
  model_id: string;
  market_id: string;
  cohort_id: string;
  round_id: string;
  action: string;
  estimated_probability: number | null;
  market_price_at_bet: number | null;
  reasoning: string | null;
  settled: number;
  pnl: number;
  brier_score: number | null;
  created_at: string;
}

// ===========================================================================
// Polymarket Gamma API types
// ===========================================================================
export interface GammaTag {
  id?: string | number;
  label?: string;
  slug?: string;
}

export interface GammaMarket {
  id: number | string;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string; // JSON string '["0.65","0.35"]'
  volume: number;
  volume24hr: number;
  active: boolean;
  closed: boolean;
  endDateIso: string;
  endDate?: string; // present on events-nested markets; mirrors endDateIso
  description: string;
  // Sports signals (present only on sports markets). sportsMarketType is set to
  // 'moneyline' | 'spreads' | 'totals' on individual game markets. NOTE: it is
  // NOT set on championship FUTURES (e.g. "Will France win the World Cup?") --
  // those are caught only by the parent event's tags, so tag-based exclusion is
  // the reliable filter, not these fields.
  sportsMarketType?: string | null;
  gameStartTime?: string | null;
}

export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  markets: GammaMarket[];
  tags?: GammaTag[]; // category labels: "Politics", "Sports", "Crypto", ...
  volume: number;
  volume24hr?: number;
  startDate: string;
  endDate: string;
}

// A genuinely-future, non-sports market selected for forecasting, carrying the
// primary category tag derived from its parent event (for display / the story).
export interface ForecastableMarket extends GammaMarket {
  category: string | null;
}

// ===========================================================================
// Scoring / analysis types
// ===========================================================================

// One row of the skill leaderboard. The headline metric is `skill_vs_crowd`
// (>0 means the forecaster beats the market on Brier over the shared resolved set).
export interface ForecasterStats {
  forecaster_id: string;
  display_name: string;
  provider: string;
  avatar_emoji: string;
  color: string;
  kind: ForecasterKind;
  n_total: number; // forecasts attempted
  n_resolved: number; // settled, scored (non-void)
  ok_rate: number; // valid-forecast rate (pipeline/model reliability)
  brier: number; // mean Brier, lower is better
  log_loss: number; // mean log loss, lower is better
  calibration_error: number; // expected calibration error (lower is better)
  resolution: number; // Brier resolution component (higher = more informative)
  reliability: number; // Brier reliability component (lower = better calibrated)
  skill_vs_crowd: number; // crowdBrier - forecasterBrier on shared markets
  avg_prob: number;
  paper_pnl: number; // secondary: Kelly paper P&L vs crowd
  total_api_cost: number;
}

export interface BrierDecomposition {
  reliability: number;
  resolution: number;
  uncertainty: number;
}

export interface CalibrationBucket {
  bucket: string;
  midpoint: number;
  avgForecast: number;
  winRate: number;
  count: number;
}

// Cell of the model error-correlation matrix.
export interface CorrelationCell {
  a: string;
  b: string;
  corr: number; // Pearson correlation of per-market forecast errors
  n: number;
}

// One point on the "does adding models help?" curve.
export interface EnsembleSizePoint {
  size: number; // number of models averaged
  brier: number; // mean Brier of the size-k ensemble (averaged over subsets)
  meanIndividualBrier: number; // mean Brier of individuals (reference)
}

export interface EnsembleComparison {
  ensembleBrier: number;
  meanIndividualBrier: number;
  bestIndividualBrier: number;
  bestIndividualId: string;
  crowdBrier: number;
  nMarkets: number;
}
