# LLM Prediction Arena

Six cheap, recent LLMs make **blind** probability forecasts on real short-horizon [Polymarket](https://polymarket.com) markets — they never see the market price. We then ask the question this project is really about: **how much do you actually gain by pooling many models into an ensemble, and can that ensemble beat the crowd?**

Unlike static LLM benchmarks that leak into training data, forecasting a *future* event can't be memorized. And because every model forecasts blind, the forecasts are genuinely independent — which is the entire premise behind aggregating them. Independent errors can cancel; correlated errors cannot.

**Tech stack:** Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · Recharts · Turso (libSQL) · OpenRouter · Vercel Cron

Inspired by [Forecaster Arena](https://forecasterarena.com).

---

## Table of Contents

1. [The Three Ideas](#the-three-ideas)
2. [How a Round Works](#how-a-round-works)
3. [The Forecasters](#the-forecasters)
4. [Scoring: Skill First](#scoring-skill-first)
5. [The Lesson](#the-lesson)
6. [Failures Are Visible](#failures-are-visible)
7. [Market Selection](#market-selection)
8. [The Forecast Call](#the-forecast-call)
9. [Data Model](#data-model)
10. [Automation & Budget Cap](#automation--budget-cap)
11. [Architecture](#architecture)
12. [Running Locally](#running-locally)
13. [Deploying to Vercel](#deploying-to-vercel)
14. [References](#references)

---

## The Three Ideas

1. **Blind forecasting.** Each model is shown only a market's question, description, and resolution date — and asked for a single number: P(YES). It **never sees the market price**. A model that could peek at the price could just echo it, and an ensemble of price-echoers would tell us nothing. Hiding the price is what keeps the forecasts independent.

2. **The crowd as a baseline.** The Polymarket price is scored as its own forecaster, **"the Crowd."** A market trading at 62¢ is a 62% forecast. The crowd aggregates the money and opinions of many humans and bots, so it is a strong, hard-to-beat baseline. Every model and the ensemble are scored on exactly the same resolved markets as the crowd.

3. **Skill first.** The headline is *forecasting skill* — Brier score, log loss, calibration, and skill vs. the crowd — not trading profit. A clearly-labeled paper-P&L view exists as a secondary sanity check, never the main story.

---

## How a Round Works

A round runs automatically (Vercel Cron), from the Arena page, or via `POST /api/rounds`:

1. **Ensure an active cohort.** Competition is grouped into weekly cohorts (ISO week ids like `2026-W22`). If none is active for the current week, one is created.
2. **Select markets.** From the cached Polymarket markets we pick up to **12 short-horizon** binary markets — unresolved, resolving within **7 days**, with a price in `[0.05, 0.95]` (near-certain markets measure nothing), sorted by 24h volume.
3. **Collect blind forecasts.** For each market, all **6 models are called in parallel** via OpenRouter. Each gets an identical system + user prompt with the question, description, and resolution date — **no price**. Output is structured JSON: `probability_yes`, `reasoning`, `key_factors`.
4. **Compute the ensemble.** The `ensemble` forecaster's probability is the **unweighted mean of the valid model probabilities** for that market — no weighting, no tuning, zero API cost. If a model failed to return a usable forecast, it is simply left out of that market's average rather than substituted with a default.
5. **Record the crowd.** The `crowd` forecaster's probability is the Polymarket price itself — the baseline to beat.
6. **Settle later.** Settlement runs every 4 hours: it checks Polymarket for resolved markets and scores every valid forecast (Brier + log loss). A fresh cohort opens every Monday; the previous one moves to `settling` and auto-completes when all its forecasts are settled.

```
Cohort (ISO week, e.g. 2026-W22)
  │
  ├─ Round (10:00 & 22:00 UTC daily)
  │     ├─ up to 12 short-horizon markets (≤ 7 days, price 0.05–0.95)
  │     ├─ 6 models forecast BLIND, in parallel  → one row each (ok or failure)
  │     ├─ ensemble = mean of the valid model probs   (computed, $0)
  │     └─ crowd    = the Polymarket price            (baseline)
  │
  ├─ Settlement (every 4 hours)
  │     ├─ resolved YES/NO → score Brier + log loss on every valid forecast
  │     ├─ voided          → settle with NULL scores, excluded from the board
  │     └─ failed (ok=0)   → settled, recorded, but NEVER scored
  │
  └─ New cohort (Monday 00:00 UTC) → previous → "settling" → auto-"completed"
```

---

## The Forecasters

We deliberately pick capable but inexpensive recent models, and lean on **provider diversity** (US, EU, and China labs). Diverse models tend to make uncorrelated mistakes — and uncorrelated errors are exactly what averaging can cancel.

| Forecaster | Provider | Region | OpenRouter ID | Cost (in / out per 1M) |
|---|---|---|---|---|
| 🔮 DeepSeek V4 Flash | DeepSeek | CN | `deepseek/deepseek-v4-flash` | $0.10 / $0.20 |
| 🐲 Qwen3 235B | Alibaba | CN | `qwen/qwen3-235b-a22b-2507` | $0.071 / $0.10 |
| 🌱 Seed 1.6 Flash | ByteDance | CN | `bytedance-seed/seed-1.6-flash` | $0.075 / $0.30 |
| 🧠 GPT-4.1 Mini | OpenAI | US | `openai/gpt-4.1-mini` | $0.40 / $1.60 |
| 💎 Gemini 3.1 Flash Lite | Google | US | `google/gemini-3.1-flash-lite` | $0.25 / $1.50 |
| 🌀 Mistral Small 3.2 | Mistral | EU | `mistralai/mistral-small-3.2-24b-instruct` | $0.075 / $0.20 |
| 🎯 **Ensemble** | Aggregate | — | *computed* | **$0.00** |
| 👥 **The Crowd** | Polymarket | — | *market price* | *baseline* |

The ensemble makes no API call — it is the mean of the six models' probabilities. The crowd makes no API call — it is the market price.

---

## Scoring: Skill First

Once a market resolves, every valid forecast on it is scored. All metrics are computed in TypeScript from the settled `forecasts` table (the data is small and the math is clearer there than in SQL).

- **Brier score** — mean squared error between forecast and outcome, `(p − y)²`. `0` is perfect, `0.25` is a coin flip. Lower is better. *This is the default leaderboard sort.*
- **Log loss** — penalizes confident mistakes far more harshly than Brier. Probabilities are clamped away from 0 and 1 so a single wrong "certainty" can't produce an infinite score.
- **Expected calibration error (ECE)** — bins forecasts by confidence (10 buckets) and measures the average gap between stated confidence and actual hit rate. The calibration chart on each profile visualizes the same data.
- **Brier decomposition** — `Brier = reliability − resolution + uncertainty`. *Reliability* (lower better) is within-bucket calibration; *resolution* (higher better) is how decisively a forecaster separates winners from losers; *uncertainty* is the irreducible base-rate variance, identical for everyone on the shared set.
- **Skill vs. crowd** — the headline number: crowd Brier minus the forecaster's Brier on their shared resolved markets. **Positive means it beat the market.**
- **Paper P&L** *(secondary)* — Kelly-stakes each forecaster's edge over the crowd at the crowd's own odds. Answers "could you have made money acting on this disagreement?" The crowd scores exactly `0` by construction. Clearly labeled as a sanity check, not the headline.

---

## The Lesson

The analysis page (`/analysis`) probes three questions about the unweighted-mean ensemble, all on the apples-to-apples set of markets where every model produced a scored forecast:

1. **Does it beat its parts?** Ensemble Brier vs. the average single model, the single best model, and the crowd.
2. **How many models do you need?** We average the Brier of every *k*-model subset (all `C(6,k)` combinations) to show the marginal value of each added model.
3. **Why does it work?** The Pearson correlation of per-market forecast **errors** (`p − y`) between each pair of models. Low or negative correlation means independent mistakes — exactly what averaging can cancel.

---

## Failures Are Visible

The original version of this project had a silent bug: most model responses were empty and got coerced into a default, masking pipeline failures. The redesign makes failure a first-class, visible outcome.

- Every forecast row carries `ok` (1 = valid, 0 = failure) and an `error` reason.
- A model that errors, times out, or returns unparseable JSON is marked `ok = 0` and **excluded from scoring** — never coerced into a default like `0.5`.
- At settlement, failed forecasts are still marked settled (and the outcome is recorded for context) but their `brier` / `log_loss` stay `NULL`, so they can never silently count as right or wrong.
- The leaderboard's **reliability** column is the valid-response rate, so pipeline and model failures show up honestly instead of inflating or deflating skill.
- The ensemble is itself recorded as a visible failure (`"no valid member forecasts"`) on any market where no member returned a usable probability — never a fake `0.5`.

---

## Market Selection

Markets come from the public **Polymarket Gamma API** (no auth). A round selects markets that are:

| Filter | Threshold | Why |
|---|---|---|
| `resolved == 0` | required | Only open markets. |
| `yes_price` | `0.05 – 0.95` | Skip near-certain markets — there's no skill to measure when the crowd already knows. |
| Time horizon | `> 0` and `≤ 7 days` | **Short horizon** so forecasts resolve fast and the board reflects settled outcomes, not open bets. |
| Sort / cap | by 24h volume, top **12** | Prefer liquid markets with meaningful prices. |

Short horizons mean quick feedback; the leaderboard is built only from markets that have actually resolved.

---

## The Forecast Call

Each model is called through OpenRouter (`src/lib/openrouter.ts`) with a **blind** prompt:

- **System prompt** instructs a professional-forecaster role, base-rate-then-evidence reasoning, good calibration, and explicitly notes that **no market price or odds are provided**.
- **User prompt** contains only the question, background/resolution criteria, and the resolution date.
- **Web search** is enabled via the OpenRouter plugins API: `plugins: [{ id: "web", max_results: 4 }]` (not the `:online` suffix, which can silently swap model versions).
- **`temperature: 0`** for reproducibility; `max_tokens: 1800`.
- **Structured output:** `response_format: { type: "json_schema" }` requiring `probability_yes` ∈ [0,1], `reasoning`, and `key_factors[]`, validated with Zod.
- **Robustness:** up to 3 retries. Transient errors (HTTP 429 / 5xx) back off and retry; the strict JSON schema is relaxed to plain `json_object` on retry; JSON is also extracted from fenced/embedded text if a model ignores strict mode. Hard failures (e.g. HTTP 402 "out of credits") fail fast and are recorded as failures.

---

## Data Model

The core table is `forecasts` — one row per `(round, market, forecaster)`, unique on that triple so re-running a round is idempotent (`INSERT OR REPLACE`):

| Column | Meaning |
|---|---|
| `forecaster_id` / `forecaster_kind` | `model` (one of six), `ensemble`, or `crowd`. |
| `prob_yes` | The forecast, or `NULL` on failure. |
| `crowd_price` | The Polymarket price at forecast time. |
| `reasoning` / `key_factors` | Model's rationale (JSON array of strings). |
| `prompt_text` / `raw_response` | Full audit trail for reproducibility. |
| `ok` / `error` | `1`/`0` validity + failure reason. |
| `api_cost` / `api_latency_ms` | Per-call cost and round-trip time. |
| `settled` / `outcome` / `brier` / `log_loss` | Filled in at settlement. |

Markets carry a `resolved` code: `0` = open, `1` = YES, `2` = NO, `3` = voided. Voided markets are excluded from all scoring.

---

## Automation & Budget Cap

Three Vercel Cron jobs (`vercel.json`) run everything hands-off. Each cron endpoint requires an `Authorization: Bearer $CRON_SECRET` header (Vercel sets this automatically).

| Cron Job | Schedule | Endpoint | What It Does |
|---|---|---|---|
| **New Rounds** | `0 10,22 * * *` (10:00 & 22:00 UTC) | `GET /api/cron/round` | Syncs markets, collects blind forecasts from 6 models on short-horizon markets, computes ensemble + crowd. |
| **Settlement** | `0 */4 * * *` (every 4 hours) | `GET /api/cron/settle` | Checks resolved markets, scores Brier + log loss, handles voided markets, completes settling cohorts. |
| **New Cohort** | `0 0 * * 1` (Monday 00:00 UTC) | `GET /api/cron/cohort` | Opens a new weekly cohort; archives the previous week. |

**Budget cap.** `BUDGET_CAP_USD` (default `100`) is a soft guard: a round stops launching new markets once cumulative `api_cost` would exceed the cap, and the round is recorded as `partial`. The Arena page shows a live cost dashboard (total spent, per-model, per-round, daily cumulative).

### Selected API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/rounds` | Trigger a new forecasting round. |
| GET | `/api/rounds` · `/api/rounds/[id]` | List rounds / round detail with all forecasts. |
| GET | `/api/cohorts` · `/api/cohorts/[id]` | List cohorts / cohort detail with leaderboard + ensemble comparison. |
| GET | `/api/markets` | List cached markets. |
| GET | `/api/leaderboard` | Computed skill leaderboard. |
| GET | `/api/analysis` | Ensemble comparison, size curve, error-correlation matrix. |
| GET | `/api/costs` | Cost summary (budget, per-model, per-round, daily). |
| POST | `/api/settle` | Settle resolved markets on demand. |

---

## Architecture

```
Vercel Cron                Polymarket Gamma API        OpenRouter API
(round 2x/day,             (public, no auth)           (API key required)
 settle every 4h,                 │                          │
 cohort weekly)                   ▼                          ▼
      │                     polymarket.ts              openrouter.ts
      │                     (fetch, filter,            (BLIND forecast call:
      ▼                      short-horizon select,      web-search plugin,
  cost-tracker.ts            check resolution,          temp 0, json schema,
  (budget cap,               voided detection)          retry + fallback)
   per-model/round)                │                          │
      │                            ▼                          ▼
      │                       markets table  ◄──────►   prediction.ts
      ▼                       (Turso / libSQL)           (orchestrate round:
  cron route handlers                                     select markets, call
  (auth via CRON_SECRET)                                  6 models in parallel,
                                                          compute ensemble + crowd)
                                                                 │
                                                                 ▼
                                                           forecasts table
                                                           (one row per model/
                                                            ensemble/crowd, full
                                                            audit trail, ok flag)
                                                                 │
                                                                 ▼
                                                           settlement.ts
                                                           (check resolution,
                                                            voided handling,
                                                            Brier + log loss,
                                                            cohort lifecycle)
                                                                 │
                                                                 ▼
                                                           scoring.ts
                                                           (leaderboard, calibration,
                                                            Brier decomposition,
                                                            skill vs crowd, ensemble
                                                            comparison + size curve,
                                                            error correlation)
                                                                 │
                                                                 ▼
                                                            Next.js UI
                                                            (leaderboard, The Lesson,
                                                             arena, cohorts, profiles,
                                                             Recharts, dark mode)
```

### Key Design Decisions

- **Blind forecasts.** Hiding the market price is what makes the forecasts independent — and independence is what makes the ensemble meaningful.
- **The crowd is a forecaster.** Treating the market price as a competitor gives an honest, hard-to-beat baseline scored on the identical market set.
- **Unweighted-mean ensemble.** No tuning, no weighting, zero cost. A deliberately simple aggregation so any edge is attributable to diversity, not clever weighting.
- **Failures are visible** (`ok` flag), never coerced into a default — see above.
- **Turso / libSQL.** SQLite-compatible edge DB. Local `file:db/arena.db` for dev, Turso cloud in production; zero-config locally.
- **OpenRouter** for one integration across six providers, plus the web-search plugin and structured output.
- **`temperature: 0`** everywhere for reproducibility; every prompt and raw response is stored for full auditability.

---

## Running Locally

### Prerequisites
- Node.js 20+
- An OpenRouter API key ([get one](https://openrouter.ai/keys))

### Setup
```bash
npm install
```

### Environment
Create `.env.local`:
```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Automation (optional for local dev)
CRON_SECRET=any-secret-string
BUDGET_CAP_USD=100

# Database (omit both for local file-based SQLite at db/arena.db)
# TURSO_DATABASE_URL=libsql://your-db.turso.io
# TURSO_AUTH_TOKEN=your-token
```

### Start
```bash
npm run dev
```

The database is created automatically on first request, with all tables and the eight seeded forecasters (6 models + ensemble + crowd).

### Usage Flow
1. Open <http://localhost:3000>.
2. Go to **Arena** → **New Round** (creates a cohort, fetches markets, collects blind forecasts).
3. Wait ~30–60s for the model calls to complete.
4. View per-market, side-by-side forecasts on the **Rounds** page.
5. Settle resolved markets (Arena control or `POST /api/settle`).
6. Watch the **Leaderboard** and **The Lesson** update as markets resolve.

> `scripts/test-roster.mjs` probes OpenRouter model availability/reliability with the same schema and web-search plugin the app uses — handy after changing the roster or topping up credits.

---

## Deploying to Vercel

1. **Create a Turso database:**
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso db create arena
   turso db show arena --url          # → TURSO_DATABASE_URL
   turso db tokens create arena       # → TURSO_AUTH_TOKEN
   ```
2. **Set environment variables** (Vercel → Settings → Environment Variables): `OPENROUTER_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CRON_SECRET`, and optionally `BUDGET_CAP_USD`.
3. **Deploy** (`vercel deploy --prod` or connect the GitHub repo). The schema initializes and forecasters seed on first request; the three crons start on Vercel's schedule.

> API routes that make LLM calls set `export const maxDuration = 300;` so rounds don't time out.

---

## References

- [Forecaster Arena](https://forecasterarena.com) — prior art and inspiration ([GitHub](https://github.com/setrf/forecasterarena))
- [Brier Score](https://en.wikipedia.org/wiki/Brier_score) — the calibration metric, and its [decomposition](https://en.wikipedia.org/wiki/Brier_score#Decomposition)
- [Polymarket Gamma API](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [OpenRouter Docs](https://openrouter.ai/docs/quickstart) · [Web Search Plugin](https://openrouter.ai/docs/guides/features/plugins/web-search) · [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)

---

*An open teaching project on forecast aggregation. Not financial advice. No real money is wagered.*
