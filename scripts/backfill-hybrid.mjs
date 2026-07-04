// One-time backfill: add the `hybrid` (Market × Models) forecaster to every
// PENDING market-round, computed from the model probabilities and crowd price
// that were stored at forecast time.
//
// This is NOT lookahead: only unresolved markets are touched (outcome unknown),
// and the blend uses exactly the inputs that existed when the round ran. It
// simply gives the live out-of-sample test a running start on the ~200 open
// markets instead of waiting for new rounds.
//
// Usage: node scripts/backfill-hybrid.mjs [--dry-run]
import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@libsql/client";

config({ path: ".env.local" });

const MODEL_IDS = new Set([
  "deepseek-v4-flash",
  "qwen3-235b",
  "seed-1.6-flash",
  "gpt-4.1-mini",
  "gemini-3.1-flash-lite",
  "mistral-small-3.2",
]);
const HYBRID_CROWD_WEIGHT = 0.8;
const dryRun = process.argv.includes("--dry-run");

const clamp = (p) => Math.min(0.999, Math.max(0.001, p));
const logit = (p) => Math.log(clamp(p) / (1 - clamp(p)));
const invLogit = (l) => 1 / (1 + Math.exp(-l));

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:db/arena.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const { rows } = await db.execute(`
  SELECT f.round_id, f.cohort_id, f.market_id, f.forecaster_id, f.prob_yes, f.crowd_price
  FROM forecasts f
  JOIN markets m ON m.id = f.market_id
  WHERE f.settled = 0 AND f.ok = 1 AND f.prob_yes IS NOT NULL
    AND m.resolved = 0
`);

const groups = new Map();
for (const r of rows) {
  const k = `${r.round_id}|${r.market_id}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const { rows: existing } = await db.execute(
  "SELECT round_id, market_id FROM forecasts WHERE forecaster_id = 'hybrid'",
);
const have = new Set(existing.map((r) => `${r.round_id}|${r.market_id}`));

let inserted = 0;
let skipped = 0;
for (const [k, g] of groups) {
  if (have.has(k)) {
    skipped++;
    continue;
  }
  const models = g.filter((r) => MODEL_IDS.has(r.forecaster_id));
  const crowdPrice = g[0].crowd_price;
  if (models.length < 3 || crowdPrice == null) {
    skipped++;
    continue;
  }
  const lm = models.reduce((s, r) => s + logit(r.prob_yes), 0) / models.length;
  const prob = invLogit(HYBRID_CROWD_WEIGHT * logit(crowdPrice) + (1 - HYBRID_CROWD_WEIGHT) * lm);
  if (!dryRun) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO forecasts
              (round_id, cohort_id, market_id, forecaster_id, forecaster_kind,
               prob_yes, reasoning, key_factors, crowd_price, prompt_text, raw_response,
               ok, error, api_cost, api_latency_ms, settled, outcome, brier, log_loss)
            VALUES (@round_id, @cohort_id, @market_id, 'hybrid', 'ensemble',
                    @prob_yes, @reasoning, NULL, @crowd_price, NULL, NULL,
                    1, NULL, 0, 0, 0, NULL, NULL, NULL)`,
      args: {
        round_id: g[0].round_id,
        cohort_id: g[0].cohort_id,
        market_id: g[0].market_id,
        prob_yes: prob,
        reasoning: `Backfilled at launch from stored round-time inputs: ${HYBRID_CROWD_WEIGHT} x market price + ${(1 - HYBRID_CROWD_WEIGHT).toFixed(1)} x consensus of ${models.length}/6 valid model forecasts.`,
        crowd_price: crowdPrice,
      },
    });
  }
  inserted++;
}

console.log(
  `${dryRun ? "[dry-run] would insert" : "inserted"} ${inserted} hybrid forecasts, skipped ${skipped} (already present / insufficient inputs)`,
);
