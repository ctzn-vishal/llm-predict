import type { BetSide } from "./schemas";

// ---------------------------------------------------------------------------
// The stage-2 game: forecast blind, then decide whether the edge is worth
// acting on.
//
// The question this measures is NOT "can a model out-trade Polymarket" -- the
// arena already answered that (no; see /data). It is the narrower and still
// open question: does a model know WHICH of its own forecasts to trust?
//
// That is why the null arm is "bet every edge". Both arms use the same
// probabilities, the same prices, the same Kelly sizing, on the same markets.
// The ONLY difference is the model's bet/pass bit, so the difference between
// them isolates selectivity and nothing else:
//
//     selectivity alpha = mean(what it chose) - mean(betting everything)
//
// Because a passed market contributes 0 to the first arm and its full P&L to
// the second, alpha > 0 exactly when the bets it declined would have lost
// money. That is the whole hypothesis, stated as arithmetic.
// ---------------------------------------------------------------------------

/** Fraction of the bankroll applied to the compounding display. Half-Kelly is
 *  the standard hedge against the ruin risk of full Kelly on a small sample. */
export const KELLY_MULTIPLIER = 0.5;

/** Starting balance for the compounding bankroll narrative. */
export const STARTING_BANKROLL = 1000;

/** Below this edge there is nothing to decide, so we never spend a call. */
export const MIN_EDGE = 0.02;

/** Which way the model's own forecast points relative to the price. */
export function impliedSide(probYes: number, price: number): BetSide {
  return probYes >= price ? "yes" : "no";
}

/**
 * Kelly stake as a fraction of bankroll, from the model's own probability
 * against the market price. Matches the formula already used for the
 * leaderboard's paper P&L so the two are directly comparable.
 */
export function kellyFraction(probYes: number, price: number): number {
  if (price <= 0 || price >= 1) return 0;
  const f = probYes >= price
    ? (probYes - price) / (1 - price) // back YES at `price`
    : (price - probYes) / price; // back NO at `1 - price`
  return Math.min(1, Math.max(0, f));
}

/**
 * Profit per 1 unit staked, once the outcome is known.
 *
 * Backing YES at price c: one unit buys 1/c shares that pay 1 each on YES, so
 * a win returns (1-c)/c and a loss returns -1. Backing NO is the mirror image
 * at price (1-c). Returns 0 for a market that cannot be traded.
 */
export function flatPnl(side: BetSide, price: number, outcome: 0 | 1): number {
  if (price <= 0 || price >= 1) return 0;
  if (side === "yes") return outcome === 1 ? (1 - price) / price : -1;
  return outcome === 0 ? price / (1 - price) : -1;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface SettledDecision {
  forecasterId: string;
  createdAt: string;
  action: "bet" | "pass";
  side: BetSide;
  price: number;
  probYes: number;
  kellyFraction: number;
  outcome: 0 | 1;
  pnlFlat: number; // 0 when passed
  nullPnlFlat: number; // as if it had always bet
}

export interface BettingStats {
  forecasterId: string;
  n: number; // decisions with a valid answer AND a settled market
  nBet: number;
  nPass: number;
  passRate: number;
  /** Mean flat P&L per opportunity under the model's own choices. */
  chosenPnl: number;
  /** Mean flat P&L per opportunity if it had bet every edge (the null). */
  nullPnl: number;
  /** chosenPnl - nullPnl. The headline: did choosing beat not choosing? */
  alpha: number;
  /** Mean P&L of the bets it DECLINED. Negative means passing was right. */
  passedPnl: number;
  /** Mean P&L of the bets it TOOK. */
  takenPnl: number;
  hitRate: number; // share of taken bets that won
  finalBankroll: number; // compounding, half-Kelly, for the narrative
  maxDrawdown: number;
  totalStaked: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * Compounding bankroll, half-Kelly, in chronological order. This is the
 * WATCHABLE number, not the scored one: it is path-dependent, so early luck
 * dominates the final standing. The scored metric is `alpha`, computed on flat
 * stakes where every market is one independent observation.
 */
export function simulateBankroll(
  decisions: SettledDecision[],
  start = STARTING_BANKROLL,
): { curve: { t: string; bankroll: number }[]; final: number; maxDrawdown: number } {
  const sorted = [...decisions].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  let bankroll = start;
  let peak = start;
  let maxDrawdown = 0;
  const curve: { t: string; bankroll: number }[] = [{ t: "start", bankroll }];

  for (const d of sorted) {
    if (d.action === "bet") {
      const f = d.kellyFraction * KELLY_MULTIPLIER;
      // pnlFlat is already "profit per unit staked", so scaling by the staked
      // fraction gives the bankroll return directly.
      bankroll *= 1 + f * d.pnlFlat;
      if (bankroll < 0) bankroll = 0;
    }
    peak = Math.max(peak, bankroll);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - bankroll) / peak);
    curve.push({ t: d.createdAt, bankroll });
  }
  return { curve, final: bankroll, maxDrawdown };
}

export function computeStats(decisions: SettledDecision[], forecasterId: string): BettingStats {
  const taken = decisions.filter((d) => d.action === "bet");
  const passed = decisions.filter((d) => d.action === "pass");
  const chosenPnl = mean(decisions.map((d) => (d.action === "bet" ? d.pnlFlat : 0)));
  const nullPnl = mean(decisions.map((d) => d.nullPnlFlat));
  const sim = simulateBankroll(decisions);

  return {
    forecasterId,
    n: decisions.length,
    nBet: taken.length,
    nPass: passed.length,
    passRate: decisions.length ? passed.length / decisions.length : 0,
    chosenPnl,
    nullPnl,
    alpha: chosenPnl - nullPnl,
    passedPnl: mean(passed.map((d) => d.nullPnlFlat)),
    takenPnl: mean(taken.map((d) => d.pnlFlat)),
    hitRate: taken.length ? taken.filter((d) => d.pnlFlat > 0).length / taken.length : 0,
    finalBankroll: sim.final,
    maxDrawdown: sim.maxDrawdown,
    totalStaked: taken.reduce((s, d) => s + d.kellyFraction * KELLY_MULTIPLIER, 0),
  };
}

// ---------------------------------------------------------------------------
// Baselines. None of these cost an API call, and without them a betting result
// is uninterpretable: the sample resolves YES only ~28% of the time and every
// model under-predicts YES, so "bet NO constantly" is profitable from BIAS
// alone. A model that cannot beat these has demonstrated nothing.
// ---------------------------------------------------------------------------

export interface BaselineRow {
  key: string;
  label: string;
  desc: string;
  pnl: number;
  n: number;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Baselines evaluated on the SAME opportunity set the models faced, so the
 * comparison is paired throughout.
 */
export function computeBaselines(decisions: SettledDecision[]): BaselineRow[] {
  if (decisions.length === 0) return [];

  const alwaysNo = mean(decisions.map((d) => flatPnl("no", d.price, d.outcome)));
  const alwaysYes = mean(decisions.map((d) => flatPnl("yes", d.price, d.outcome)));
  const betEverything = mean(decisions.map((d) => d.nullPnlFlat));

  // A passer that abstains at the observed rate but chooses at random. This is
  // the control that matters most: abstaining reduces variance and can flatter
  // a bankroll on its own, so proving the CHOICE did the work requires a
  // chooser that passes just as often for no reason at all.
  const rng = makeRng(0x51DE);
  const passRate = decisions.filter((d) => d.action === "pass").length / decisions.length;
  const randomPasser = mean(
    decisions.map((d) => (rng() < passRate ? 0 : d.nullPnlFlat)),
  );

  // Coin-flip side selection, always betting.
  const rng2 = makeRng(0xC01D);
  const randomSide = mean(
    decisions.map((d) => flatPnl(rng2() < 0.5 ? "yes" : "no", d.price, d.outcome)),
  );

  return [
    {
      key: "bet-everything",
      label: "Bet every edge (the null)",
      desc: "Take every disagreement with the price. This is the arm each model's selectivity is measured against.",
      pnl: betEverything,
      n: decisions.length,
    },
    {
      key: "random-passer",
      label: "Random passer, matched rate",
      desc: "Passes as often as the models do, but picks which to skip at random. Isolates whether the choosing helped, or just the abstaining.",
      pnl: randomPasser,
      n: decisions.length,
    },
    {
      key: "always-no",
      label: "Always bet NO",
      desc: "Ignores the models entirely. With a ~28% YES base rate this is the artifact to beat — profit here is the sample's pessimism, not skill.",
      pnl: alwaysNo,
      n: decisions.length,
    },
    {
      key: "always-yes",
      label: "Always bet YES",
      desc: "The mirror image, included so the NO baseline can be read as a bias effect rather than an edge.",
      pnl: alwaysYes,
      n: decisions.length,
    },
    {
      key: "random-side",
      label: "Coin-flip side",
      desc: "Always bets, picks the side at random. Checks that side selection — not stake sizing — is doing the work.",
      pnl: randomSide,
      n: decisions.length,
    },
  ];
}

/** Paired bootstrap over decisions, for a CI on selectivity alpha. */
export function alphaCI(
  decisions: SettledDecision[],
  samples = 2000,
): { lo: number; hi: number } | null {
  const diffs = decisions.map((d) => (d.action === "bet" ? d.pnlFlat : 0) - d.nullPnlFlat);
  if (diffs.length < 5) return null;
  const rng = makeRng(0xA1FA);
  const means: number[] = [];
  for (let b = 0; b < samples; b++) {
    let sum = 0;
    for (let i = 0; i < diffs.length; i++) sum += diffs[(rng() * diffs.length) | 0];
    means.push(sum / diffs.length);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(0.05 * samples)], hi: means[Math.floor(0.95 * samples)] };
}
