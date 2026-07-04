// ---------------------------------------------------------------------------
// Probability aggregation in log-odds (logit) space.
//
// Why logit space? Averaging raw probabilities compresses toward 0.5 and treats
// a 0.98 -> 0.99 move the same as 0.50 -> 0.51, but evidence is multiplicative:
// log-odds is the natural scale for combining independent probability opinions.
//
// The `hybrid` forecaster ("Market × Models") anchors on the market price and
// nudges it with the model consensus:
//
//     logit(p_hybrid) = w * logit(price) + (1 - w) * mean(logit(p_model_i))
//
// with w = 0.8. This is the live, out-of-sample test of the arena's sharpest
// backtest finding: on the first ~550 settled forecasts, this blend scored a
// better Brier than the market price itself -- i.e. six sub-$0.001 LLM calls
// carry real information the market hasn't priced in. See /insights.
// ---------------------------------------------------------------------------

// Keep probabilities away from 0/1 so logit stays finite. Matches the EPS
// clamping used for log-loss in settlement.
const P_MIN = 0.001;
const P_MAX = 0.999;

/** Weight on the market price in the hybrid blend (rest goes to the models). */
export const HYBRID_CROWD_WEIGHT = 0.8;

export function clampProb(p: number): number {
  return Math.min(P_MAX, Math.max(P_MIN, p));
}

export function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}

export function invLogit(l: number): number {
  return 1 / (1 + Math.exp(-l));
}

/** Mean of probabilities in logit space (geometric-mean-of-odds pool). */
export function logitMeanProb(probs: number[]): number {
  if (probs.length === 0) return 0.5;
  const m = probs.reduce((s, p) => s + logit(p), 0) / probs.length;
  return invLogit(m);
}

/**
 * Market × Models blend: logit-space weighted average of the crowd price and
 * the model consensus. Returns null when either ingredient is missing --
 * callers record that as a visible ok=0 failure, never a fake 0.5.
 */
export function hybridProb(
  crowdPrice: number | null,
  modelProbs: number[],
  crowdWeight = HYBRID_CROWD_WEIGHT,
): number | null {
  if (crowdPrice == null || modelProbs.length === 0) return null;
  const lc = logit(crowdPrice);
  const lm = modelProbs.reduce((s, p) => s + logit(p), 0) / modelProbs.length;
  return invLogit(crowdWeight * lc + (1 - crowdWeight) * lm);
}
