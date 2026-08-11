import { queryAll, queryOne } from "./db";
import { forecasterMeta } from "./models";
import {
  alphaCI,
  computeBaselines,
  computeStats,
  simulateBankroll,
  STARTING_BANKROLL,
  type BaselineRow,
  type BettingStats,
  type SettledDecision,
} from "./betting";
import type { BetSide } from "./schemas";

// ---------------------------------------------------------------------------
// Read layer for the stage-2 game (/game).
//
// Everything here is paired: a decision only enters the analysis if the model
// produced BOTH a valid blind forecast and a valid bet/pass answer, and the
// market has since resolved. Rows that fail either stage are counted for
// reliability but contribute to neither arm -- otherwise a model that times out
// a lot would collect the variance-reduction benefit of abstaining without ever
// having chosen to abstain.
// ---------------------------------------------------------------------------

export interface GameRow extends BettingStats {
  name: string;
  emoji: string;
  color: string;
  alphaLo: number | null;
  alphaHi: number | null;
  alphaSignificant: boolean;
  nAttempted: number; // includes failed decisions, for the reliability column
  okRate: number;
}

export interface BankrollPoint {
  i: number;
  [forecasterId: string]: number;
}

export interface NotableBet {
  forecasterId: string;
  name: string;
  emoji: string;
  color: string;
  question: string;
  marketId: string;
  side: BetSide;
  price: number;
  probYes: number;
  pnl: number;
  rationale: string | null;
  outcome: number;
}

export interface GameData {
  rows: GameRow[];
  baselines: BaselineRow[];
  bankrollCurve: BankrollPoint[];
  bestBets: NotableBet[];
  worstBets: NotableBet[];
  bestPasses: NotableBet[];
  nDecisions: number;
  nSettled: number;
  nPending: number;
  totalCost: number;
  startingBankroll: number;
}

interface RawDecision {
  forecaster_id: string;
  market_id: string;
  question: string | null;
  prob_yes: number;
  price: number;
  side: string;
  action: string | null;
  kelly_fraction: number;
  rationale: string | null;
  outcome: number | null;
  pnl_flat: number | null;
  null_pnl_flat: number | null;
  created_at: string;
}

export async function getGameData(): Promise<GameData> {
  const counts = await queryOne<{
    n: number;
    n_settled: number;
    n_ok: number;
    cost: number;
  }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN settled = 1 AND ok = 1 AND pnl_flat IS NOT NULL THEN 1 ELSE 0 END), 0) AS n_settled,
            COALESCE(SUM(ok), 0) AS n_ok,
            COALESCE(SUM(api_cost), 0) AS cost
     FROM decisions`,
  );

  const empty: GameData = {
    rows: [],
    baselines: [],
    bankrollCurve: [],
    bestBets: [],
    worstBets: [],
    bestPasses: [],
    nDecisions: counts?.n ?? 0,
    nSettled: counts?.n_settled ?? 0,
    nPending: (counts?.n ?? 0) - (counts?.n_settled ?? 0),
    totalCost: counts?.cost ?? 0,
    startingBankroll: STARTING_BANKROLL,
  };
  if (!counts || counts.n_settled === 0) return empty;

  const raw = await queryAll<RawDecision>(
    `SELECT d.forecaster_id, d.market_id, m.question, d.prob_yes, d.price, d.side,
            d.action, d.kelly_fraction, d.rationale, d.outcome, d.pnl_flat,
            d.null_pnl_flat, d.created_at
     FROM decisions d
     LEFT JOIN markets m ON m.id = d.market_id
     WHERE d.settled = 1 AND d.ok = 1 AND d.action IS NOT NULL
       AND d.outcome IS NOT NULL AND d.pnl_flat IS NOT NULL
     ORDER BY d.created_at`,
  );

  const attempted = await queryAll<{ forecaster_id: string; n: number; n_ok: number }>(
    `SELECT forecaster_id, COUNT(*) AS n, COALESCE(SUM(ok), 0) AS n_ok
     FROM decisions GROUP BY forecaster_id`,
  );

  const byForecaster = new Map<string, SettledDecision[]>();
  for (const r of raw) {
    const d: SettledDecision = {
      forecasterId: r.forecaster_id,
      createdAt: r.created_at,
      action: r.action === "bet" ? "bet" : "pass",
      side: r.side === "no" ? "no" : "yes",
      price: r.price,
      probYes: r.prob_yes,
      kellyFraction: r.kelly_fraction,
      outcome: r.outcome === 1 ? 1 : 0,
      pnlFlat: r.pnl_flat ?? 0,
      nullPnlFlat: r.null_pnl_flat ?? 0,
    };
    const g = byForecaster.get(r.forecaster_id);
    if (g) g.push(d);
    else byForecaster.set(r.forecaster_id, [d]);
  }

  const rows: GameRow[] = [];
  for (const [id, ds] of byForecaster) {
    const meta = forecasterMeta(id);
    const stats = computeStats(ds, id);
    const ci = alphaCI(ds);
    const att = attempted.find((a) => a.forecaster_id === id);
    rows.push({
      ...stats,
      name: meta.name,
      emoji: meta.emoji,
      color: meta.color,
      alphaLo: ci?.lo ?? null,
      alphaHi: ci?.hi ?? null,
      alphaSignificant: ci ? ci.lo > 0 || ci.hi < 0 : false,
      nAttempted: att?.n ?? ds.length,
      okRate: att && att.n > 0 ? att.n_ok / att.n : 1,
    });
  }
  rows.sort((a, b) => b.alpha - a.alpha);

  // Baselines are computed on the pooled opportunity set so every forecaster
  // and every bot is measured against the same markets.
  const baselines = computeBaselines(raw.map((r) => ({
    forecasterId: r.forecaster_id,
    createdAt: r.created_at,
    action: r.action === "bet" ? "bet" : "pass",
    side: r.side === "no" ? "no" : "yes",
    price: r.price,
    probYes: r.prob_yes,
    kellyFraction: r.kelly_fraction,
    outcome: r.outcome === 1 ? 1 : 0,
    pnlFlat: r.pnl_flat ?? 0,
    nullPnlFlat: r.null_pnl_flat ?? 0,
  })));

  // Bankroll curves, indexed by decision number so several models can share an
  // x-axis despite acting on different markets.
  const curves = new Map<string, number[]>();
  let maxLen = 0;
  for (const [id, ds] of byForecaster) {
    const sim = simulateBankroll(ds);
    const series = sim.curve.map((p) => p.bankroll);
    curves.set(id, series);
    maxLen = Math.max(maxLen, series.length);
  }
  const bankrollCurve: BankrollPoint[] = [];
  for (let i = 0; i < maxLen; i++) {
    const pt: BankrollPoint = { i };
    for (const [id, series] of curves) {
      if (i < series.length) pt[id] = Math.round(series[i] * 100) / 100;
    }
    bankrollCurve.push(pt);
  }

  // Notable decisions, with the model's own words attached. The reasoning is
  // already stored on every row and nobody ever reads it; this surfaces it.
  const toNotable = (r: RawDecision, pnl: number): NotableBet => {
    const meta = forecasterMeta(r.forecaster_id);
    return {
      forecasterId: r.forecaster_id,
      name: meta.name,
      emoji: meta.emoji,
      color: meta.color,
      question: r.question ?? r.market_id,
      marketId: r.market_id,
      side: r.side === "no" ? "no" : "yes",
      price: r.price,
      probYes: r.prob_yes,
      pnl,
      rationale: r.rationale,
      outcome: r.outcome ?? 0,
    };
  };
  const taken = raw.filter((r) => r.action === "bet");
  const passed = raw.filter((r) => r.action === "pass");

  const bestBets = [...taken]
    .sort((a, b) => (b.pnl_flat ?? 0) - (a.pnl_flat ?? 0))
    .slice(0, 3)
    .map((r) => toNotable(r, r.pnl_flat ?? 0));
  const worstBets = [...taken]
    .sort((a, b) => (a.pnl_flat ?? 0) - (b.pnl_flat ?? 0))
    .slice(0, 3)
    .map((r) => toNotable(r, r.pnl_flat ?? 0));
  // The passes that saved the most: declined bets that would have lost badly.
  const bestPasses = [...passed]
    .sort((a, b) => (a.null_pnl_flat ?? 0) - (b.null_pnl_flat ?? 0))
    .slice(0, 3)
    .map((r) => toNotable(r, r.null_pnl_flat ?? 0));

  return {
    ...empty,
    rows,
    baselines,
    bankrollCurve,
    bestBets,
    worstBets,
    bestPasses,
  };
}
