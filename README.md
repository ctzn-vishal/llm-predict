# LLM Prediction Arena

An academic-grade benchmark where 6 frontier LLMs (+ 1 ensemble) compete on real [Polymarket](https://polymarket.com) prediction markets. Unlike traditional LLM benchmarks contaminated by training data, prediction markets test *genuine forecasting ability* about future events that cannot exist in any training corpus.

**Tech stack:** Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui + Recharts + Turso (libSQL) + OpenRouter + Vercel Cron

Inspired by [Forecaster Arena](https://forecasterarena.com).

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [The Betting Pipeline](#the-betting-pipeline)
3. [Market Selection](#market-selection)
4. [How Models Make Decisions](#how-models-make-decisions)
5. [Bankroll & Bet Sizing](#bankroll--bet-sizing)
6. [Settlement & P&L](#settlement--pl)
7. [Scoring System](#scoring-system)
8. [The 7 Competing Models](#the-7-competing-models)
9. [API Cost Per Round](#api-cost-per-round)
10. [Automation](#automation)
11. [Cost Monitoring & Budget Cap](#cost-monitoring--budget-cap)
12. [Architecture](#architecture)
13. [Running Locally](#running-locally)
14. [Deploying to Vercel](#deploying-to-vercel)
15. [Options to Consider / Future Enhancements](#options-to-consider--future-enhancements)

---

## How It Works

The arena operates on a **weekly cohort** system, fully automated via Vercel Cron:

1. A new **cohort** is auto-created each Monday at 00:00 UTC (e.g., `2026-W07`)
2. Every model (including the ensemble) receives a fresh **$10,000 virtual bankroll**
3. **Rounds run automatically** twice daily at 10:00 and 22:00 UTC
4. Each round presents **10-20 real Polymarket questions** to all 6 models
5. Models research via web search, then bet YES, bet NO, or PASS on each market
6. A **7th ensemble model** automatically aggregates the 6 predictions (majority vote + mean probability) at zero API cost
7. **Settlement runs every 4 hours** -- resolved markets are checked and P&L + Brier scores computed (including voided market handling)
8. At week's end, the cohort enters a **settling** state while bets resolve, then completes automatically

This creates clean comparison windows -- no snowball effects from early luck compounding across weeks.

```
Cohort (Week)
  |
  +-- Round 1 (Mon 10:00 UTC)     -- automated via Vercel Cron
  +-- Round 2 (Mon 22:00 UTC)
  +-- Round 3 (Tue 10:00 UTC)
  |     +-- 10-20 markets per round, 6 models + ensemble each
  |     +-- ...14 rounds per week (2/day)
  |
  +-- Settlement (every 4 hours)   -- automated
  |     +-- Resolved markets -> P&L + Brier scores
  |     +-- Voided markets -> refund + no Brier impact
  |     +-- Pass bets closed when their market resolves
  |
  +-- New Cohort (next Monday 00:00 UTC) -- automated
  |     +-- Previous cohort -> "settling" (bets may still resolve)
  |     +-- Auto-completes when all bets settled
```

---

## The Betting Pipeline

When a round is triggered (automatically via cron, the Arena page, or `POST /api/rounds`), the following happens:

### Step 1: Ensure Active Cohort
If no cohort exists for the current ISO week, one is auto-created with $10K bankroll per model.

### Step 2: Sync Markets from Polymarket
Markets are fetched from the Polymarket Gamma API (`GET /markets?closed=false&order=volume24hr&ascending=false&limit=100`). This returns the top 100 open markets sorted by 24-hour trading volume.

### Step 3: Filter & Select Markets
From the pool of 100, we select 10-20 markets using these criteria:

| Filter | Threshold | Reason |
|--------|-----------|--------|
| `active && !closed` | Required | Only open markets |
| `volume24hr` | > $1,000 | Minimum liquidity ensures meaningful prices |
| `yesPrice` | 0.05 - 0.95 | Skip near-certain markets (no edge to find) |
| Time horizon | 1-60 days | Too short = noise, too long = stale |

Markets are sorted by 24h volume descending and the top `N` are selected.

### Step 4: Prompt All Models
For each selected market, all 6 models are called **in parallel** via OpenRouter. Every model receives:
- An **identical system prompt** (professional forecaster instructions)
- An **identical user prompt** with market data (question, description, YES/NO prices, volume, end date)
- **Re-evaluation context**: if the model has previously bet on this market in the current cohort, its prior positions are included in the prompt (action, price at bet, estimated probability)
- **Web search enabled** via the OpenRouter `plugins` API (`plugins: [{ id: "web", max_results: 5 }]`, powered by Exa.ai)
- `temperature: 0` for reproducibility

### Step 4b: Ensemble Prediction
After all 6 models have predicted on a market, a **7th ensemble model** is computed automatically:
- **Action**: majority vote among non-pass bets (YES vs NO; tie = pass)
- **Estimated probability**: mean of all non-pass models' estimates
- **Confidence & bet size**: mean of non-pass models' values
- **Cost**: $0 (no API call)
- The ensemble bets against its own bankroll using the same deduction logic

### Step 5: Parse & Validate Responses
Each model returns structured JSON:

```json
{
  "action": "bet_yes | bet_no | pass",
  "confidence": 0.0 - 1.0,
  "bet_size_pct": 1 - 25,
  "estimated_probability": 0.0 - 1.0,
  "reasoning": "Analysis text...",
  "key_factors": ["factor1", "factor2"]
}
```

This is validated with Zod. If parsing fails, the model is recorded as a **forced pass** (API failure does not count against the model's calibration, but it does mean missed opportunity).

**Fallback chain for structured output:**
1. Try `response_format: { type: "json_schema" }` (strict schema)
2. On retry: fall back to `{ type: "json_object" }` (lenient)
3. On retry: parse JSON from raw text
4. If all fail: forced pass

### Step 6: Execute Bets & Update Bankroll
For non-pass actions:
- `bet_amount = current_bankroll * (bet_size_pct / 100)`
- The bet amount is **deducted (escrowed)** from the model's bankroll immediately
- The bet is recorded with the full prompt text, raw API response, cost, and latency

### Step 7: Store Everything
Every bet is stored with complete audit trail:
- `prompt_text`: the exact prompt sent (reproducibility)
- `raw_response`: the complete API response (reproducibility)
- `api_cost`: token cost in USD
- `api_latency_ms`: round-trip time
- `market_price_at_bet`: the YES price when the bet was placed

---

## Market Selection

Markets come from the **Polymarket Gamma API**, a public read-only API that requires no authentication.

### Why These Filters?

**Volume > $1,000/day:** Low-volume markets have unreliable prices. A market trading $50/day might show YES at $0.70, but that price could be from a single uninformed trader. High-volume markets have many participants and more efficient (but not perfect) prices.

**Price between 5c-95c:** A market at YES $0.99 is essentially resolved. There's no edge to find. Similarly, YES $0.02 markets are near-certain NOs. The interesting space is in the middle where genuine uncertainty exists.

**1-60 day horizon:** Markets resolving in <1 day give models no time to be "right for the right reasons" -- they're essentially coin flips. Markets >60 days out are too uncertain for meaningful probability estimates and take too long to resolve (slow feedback loop).

### What We Don't Filter (But Could)

| Potential Filter | Why We Skip It | Consideration |
|-----------------|---------------|---------------|
| Market category | We take all categories | Could focus on politics, crypto, sports, etc. separately |
| Minimum description length | Some markets are self-explanatory | Could ensure models have enough context |
| Duplicate/correlated markets | **Detected post-hoc** via Jaccard similarity | Adjusted P&L deduplicates within correlation clusters |
| Market maker presence | Not available via API | Professional market makers = tighter spreads = less edge |

---

## How Models Make Decisions

### The System Prompt

All 6 models receive this identical instruction set:

```
You are a professional forecaster competing in a prediction market tournament.

Rules:
1. You start each cohort with $10,000. Bet wisely.
2. Use web search to research current events relevant to this market.
3. Compare your estimated probability to the market price. Only bet when you have edge.
4. Use Kelly criterion principles for bet sizing.
5. Passing is smart when you have no edge. ~30-50% pass rate is healthy.
6. You are scored on BOTH calibration (Brier Score) and portfolio returns (P&L).
7. Your confidence should reflect your TRUE belief.
```

### What the Model Sees

For each market, the model receives:
- The **question** (e.g., "Will Bitcoin exceed $150,000 by March 2026?")
- The **description** (resolution criteria, rules)
- **Current YES/NO prices** (implied market probability)
- **24h volume** (liquidity indicator)
- **End date** (time horizon)

### What the Model Does

1. **Web search**: The OpenRouter `plugins` API enables Exa.ai-powered web search (up to 5 results). The model can look up current news, data, and context relevant to the question.
2. **Probability estimation**: The model forms its own `estimated_probability` of the event occurring.
3. **Edge detection**: It compares its estimate to the market price. If it thinks P(YES) = 0.80 but the market says 0.65, that's a 15-point edge on YES.
4. **Action decision**: Bet YES, bet NO, or PASS (no edge).
5. **Size decision**: How much of its bankroll to risk (1-25%). Follows Kelly criterion principles -- bigger edge = bigger bet.

### Key Behavioral Metrics

- **Pass rate**: A healthy model passes 30-50% of the time. A model that bets on everything is likely overconfident. A model that passes on everything is overly conservative.
- **Average confidence**: Should roughly correlate with actual accuracy. If a model says 0.90 confidence and is right 60% of the time, it's poorly calibrated.
- **Average bet size**: Aggressive models bet 15-25%, conservative ones bet 1-5%.

---

## Bankroll & Bet Sizing

### Starting State
Each model begins every cohort with **$10,000**.

### Bet Execution
When a model bets:
1. Model decides `bet_size_pct` (1-25% of current bankroll)
2. `bet_amount = bankroll * (bet_size_pct / 100)`
3. `bankroll -= bet_amount` (money is escrowed)
4. When the market resolves, P&L is calculated and added back to bankroll

### Example
```
Starting bankroll:     $10,000
Model bets 10% YES:    bet_amount = $1,000, bankroll = $9,000
Market YES price:      $0.65

If resolved YES:
  pnl = $1,000 * (1/0.65 - 1) = $1,000 * 0.538 = +$538.46
  bankroll = $9,000 + $538.46 = $9,538.46

If resolved NO:
  pnl = -$1,000
  bankroll = $9,000 + (-$1,000) = $8,000
```

### Bankroll Depletion Risk
A model that bets aggressively (25% per bet) on 15 markets per round and gets unlucky can lose most of its bankroll quickly. This is by design -- risk management is part of the benchmark.

### Why Not Kelly Criterion Directly?
We instruct models to use Kelly criterion *principles* but let them decide sizing. The full Kelly formula would be:

```
kelly_fraction = (edge / odds)
edge = estimated_probability - market_price (for YES bets)
```

We cap at 25% to prevent models from betting their entire bankroll on a single market (full Kelly is known to be too aggressive in practice; half-Kelly is more common).

---

## Settlement & P&L

### When Markets Resolve
Polymarket markets resolve when their end conditions are met. We check for resolution via `POST /api/settle`, which:

1. Queries all unsettled bets from the database
2. For each unique market, calls the Polymarket API to check if it's closed
3. Resolved markets have `outcomePrices` settle to `[1.00, 0.00]` (YES won) or `[0.00, 1.00]` (NO won)
4. **Voided markets** (closed but no clear YES/NO outcome) are handled separately -- bets are refunded with zero P&L and no Brier score impact
5. **Pass bets** on resolved/voided markets are also properly closed (settled=1, pnl=0, brier_score=NULL)
6. After settlement, any cohorts in "settling" status with all bets settled are automatically marked "completed"

### P&L Formula

The P&L calculation models how prediction markets actually work -- you're buying contracts at a price and they pay out $1 or $0:

| Scenario | Formula | Intuition |
|----------|---------|-----------|
| Bet YES, resolved YES | `betAmount * (1/yesPrice - 1)` | Bought a contract at 65c, it paid $1. Profit = 35c per contract. |
| Bet YES, resolved NO | `-betAmount` | Bought a contract at 65c, it paid $0. Lost entire bet. |
| Bet NO, resolved NO | `betAmount * (1/(1-yesPrice) - 1)` | Bought a NO contract at 35c, it paid $1. Profit = 65c per contract. |
| Bet NO, resolved YES | `-betAmount` | Bought a NO contract at 35c, it paid $0. Lost entire bet. |
| Pass | `0` | No money at risk. |
| Any bet, market voided | `0` (bet refunded) | Market cancelled/voided. Escrowed amount returned to bankroll. |

### P&L Examples

**Profitable YES bet:**
- Market YES price: $0.40 (market thinks 40% likely)
- Model bets $500 on YES
- Event happens (resolved YES)
- P&L = $500 * (1/0.40 - 1) = $500 * 1.5 = **+$750**

**Losing YES bet:**
- Market YES price: $0.80
- Model bets $500 on YES
- Event doesn't happen (resolved NO)
- P&L = **-$500**

**Profitable NO bet:**
- Market YES price: $0.85 (market thinks 85% likely)
- Model bets $300 on NO
- Event doesn't happen (resolved NO)
- P&L = $300 * (1/0.15 - 1) = $300 * 5.67 = **+$1,700**

Note: Betting against the crowd when you're right is extremely profitable. A NO bet at 15c (market price 85c YES) pays 6.67x. But if you're wrong, you lose everything.

---

## Scoring System

We use **dual scoring** to measure two fundamentally different skills:

### Axis 1: Calibration (Brier Score)

**"Do you know what you know?"**

```
Brier Score = (1/N) * SUM( (estimated_probability - actual_outcome)^2 )
```

| Score | Meaning |
|-------|---------|
| 0.000 | Perfect -- every prediction exactly right |
| 0.100 | Excellent forecaster |
| 0.200 | Decent, slightly better than random |
| 0.250 | Equivalent to always guessing 50% (coin flip) |
| 0.500 | Bad -- systematically wrong |
| 1.000 | Worst possible -- always 100% confident, always wrong |

**Applies to non-pass bets only.** Pass bets have `brier_score = NULL` and are excluded from calibration scoring. This prevents a model from gaming the Brier score by always passing and parroting the market price.

#### Brier Score Decomposition

We break the Brier score into three interpretable components:

```
Brier Score = Reliability - Resolution + Uncertainty
```

- **Reliability** (lower = better): How well-calibrated are the model's confidence buckets? If it says "80% confident" and is right 80% of the time, reliability is low (good).
- **Resolution** (higher = better): How much do the model's forecasts differ from the base rate? A model that always predicts 50% has zero resolution. A model that predicts strong opinions (10% or 90%) that correlate with outcomes has high resolution.
- **Uncertainty** (fixed per dataset): Base rate variance. Same for all models on the same set of markets. Not a model-specific property.

### Axis 2: Portfolio Returns (P&L)

**"Can you make money?"**

- **ROI%** = `(final_bankroll - 10,000) / 10,000 * 100`
- Only applies to actual bets (bet_yes / bet_no), not passes
- A model might be perfectly calibrated but too timid (small bets, low P&L)
- A model might be aggressive and occasionally brilliant (high P&L, poor Brier)

### Why Two Axes?

Consider these two models:

| Model | Brier Score | ROI% | Behavior |
|-------|------------|------|----------|
| Conservative Carl | 0.08 (excellent) | +2% (meh) | Well-calibrated but only bets 2% of bankroll, passes 70% of the time |
| Aggressive Alice | 0.22 (mediocre) | +35% (great) | Overconfident but when she's right, she bets big |

Neither is strictly "better" -- they measure different skills. The tension between calibration and value capture is what makes this benchmark interesting.

### Axis 3: Market Difficulty

Not all markets are equally hard to predict. We compute **market difficulty** using binary entropy of the market price at bet time:

```
difficulty = -p * log2(p) - (1-p) * log2(1-p)
```

| Market Price | Difficulty | Interpretation |
|-------------|-----------|----------------|
| $0.50 | 1.00 (max) | Maximally uncertain -- coin flip |
| $0.80 | 0.72 | Moderately hard |
| $0.95 | 0.29 | Easy -- near-certain outcome |

Each model's **avg_difficulty** shows the average difficulty of the markets it bet on. Beating the market on a 50/50 question is far more impressive than correctly predicting a 90/10 outcome.

### Correlated Market Detection

Polymarket frequently has clusters of related markets (e.g., "Will X happen by March?" and "Will X happen by June?"). Betting the same direction on correlated markets amplifies P&L swings from a single event, which isn't measuring forecasting skill.

The system detects correlated markets using **Jaccard similarity** on question text (tokenized, stopwords removed). Markets with >50% word overlap are assigned to the same correlation cluster using Union-Find. The **adjusted P&L** leaderboard deduplicates within clusters, counting only the first bet per cluster per model.

### Leaderboard Default Sort

The leaderboard sorts by **P&L** by default (who made the most money). Users can re-sort by Brier score to see who's most calibrated. An **adjusted P&L** view is also available that deduplicates correlated market bets.

---

## The 7 Competing Models

| Model | Provider | OpenRouter ID | Cost (in/out per 1M) | Context | Strengths |
|-------|----------|--------------|---------------------|---------|-----------|
| Gemini 3 Flash | Google | `google/gemini-3-flash-preview` | $0.50 / $3.00 | 1M | Fast, cheap, good reasoning |
| Grok 4.1 Fast | xAI | `x-ai/grok-4.1-fast` | $0.20 / $0.50 | 2M | Cheapest, real-time X data via native search |
| GPT-5.2 Chat | OpenAI | `openai/gpt-5.2-chat` | $1.75 / $14.00 | 128K | Most capable, best reasoning |
| DeepSeek V3.2 | DeepSeek | `deepseek/deepseek-v3.2` | $0.25 / $0.38 | 164K | Extremely cheap, strong coding/reasoning |
| Kimi K2.5 | Moonshot AI | `moonshotai/kimi-k2.5` | $0.45 / $2.25 | 262K | Multimodal, strong agentic tool-use |
| Qwen 3 235B | Alibaba | `qwen/qwen3-235b-a22b` | $0.20 / $0.60 | 41K | Large MoE, very cheap |
| **Ensemble (Avg)** | Aggregate | N/A | **$0.00** | N/A | Majority vote + mean probability of the 6 models above |

All models use web search via OpenRouter's `plugins` API (`plugins: [{ id: "web", max_results: 5 }]`, Exa.ai-backed). Models with native search (Grok via X, GPT via Bing) may get higher-quality search results. The ensemble model makes no API calls -- it is computed from the other 6 models' predictions.

### Why These Models?

- **Provider diversity**: Google, xAI, OpenAI, DeepSeek, Moonshot, Alibaba
- **Cost range**: $0.20-$14.00/M output tokens (70x range)
- **Architecture diversity**: Dense models, MoE models, different training approaches
- **Web search**: All have access, but through different backends
- **Ensemble**: Superforecasting research consistently shows that aggregating independent forecasts beats individual forecasters. If the ensemble beats all 6 models, that's a publishable finding. If it doesn't, that's also interesting.

### Why Not Claude?

Claude Sonnet 4 at $3/$15 per 1M tokens was 10-30x more expensive than the other models. At 90 API calls per round (6 models x 15 markets), the cost difference is significant. This is a cost-conscious benchmark.

---

## API Cost Per Round

A typical round with 15 markets and 6 models = 90 API calls.

| Model | Est. cost per call | 90 calls |
|-------|-------------------|----------|
| Grok 4.1 Fast | ~$0.001 | ~$0.09 |
| Qwen 3 235B | ~$0.001 | ~$0.09 |
| DeepSeek V3.2 | ~$0.001 | ~$0.09 |
| Kimi K2.5 | ~$0.003 | ~$0.27 |
| Gemini 3 Flash | ~$0.004 | ~$0.36 |
| GPT-5.2 Chat | ~$0.015 | ~$1.35 |
| **Web search (Exa)** | ~$0.004/call | ~$0.36 |
| **Total per round** | | **~$2.60** |

Budget approximately **$2-5 per round** depending on response lengths. With 14 automated rounds per week (2x daily), expect ~$36-70/week.

---

## Automation

The app runs completely hands-off once deployed. Three Vercel Cron jobs handle everything:

| Cron Job | Schedule | Endpoint | What It Does |
|----------|----------|----------|-------------|
| **New Rounds** | `0 10,22 * * *` (10:00 & 22:00 UTC daily) | `GET /api/cron/round` | Ensures active cohort, syncs fresh market prices from Polymarket, runs all 6 models on 10-15 markets |
| **Settlement** | `0 */4 * * *` (every 4 hours) | `GET /api/cron/settle` | Checks resolved markets via Polymarket API, computes P&L + Brier scores, updates bankrolls |
| **New Cohort** | `0 0 * * 1` (Monday 00:00 UTC) | `GET /api/cron/cohort` | Moves previous cohort to "settling" status, creates new one with fresh $10K bankrolls for all 7 models |

### Safety Features

- **Budget enforcement**: Every cron job checks the budget cap before running. If the cap is reached, the job returns a skip message instead of making API calls.
- **CRON_SECRET authentication**: All cron endpoints require `Authorization: Bearer $CRON_SECRET` header. Vercel sets this automatically for cron jobs.
- **Idempotent cohort creation**: Creating a cohort that already exists is a no-op (`INSERT OR IGNORE`).
- **Auto-recovery**: If no cohort or markets exist when a round triggers, they are auto-created.

### Manual Controls

The Arena page also has manual controls for triggering rounds and settlement on-demand (useful for testing or catching up).

---

## Cost Monitoring & Budget Cap

### Budget Cap

A hard cap of **$100** (configurable via `BUDGET_CAP_USD` env var) prevents runaway API costs. When the cap is reached:

1. All automated rounds are skipped (cron returns `{ skipped: true }`)
2. Manual round triggers return HTTP 403
3. A red warning banner appears on the Arena page

The cap is checked against `SUM(api_cost)` across all bets in the database.

### Cost Dashboard

The Arena page includes a real-time cost monitoring dashboard:

- **Budget overview cards**: Total spent, budget remaining, budget % used (with color-coded progress bar)
- **Cumulative spend chart**: Line chart tracking daily API spend over time, with a red $100 cap reference line
- **Per-model breakdown**: Horizontal bar chart showing cost by model (colored by model identity)
- **Per-round cost table**: Scrollable list of every round with its total API cost

### Cost Tracking

Every API call records its cost in the `bets.api_cost` field. The cost is reported by OpenRouter in the response headers. The cost dashboard aggregates this data in three views:

- **Per model**: Which models cost the most? (GPT-5.2 Chat will dominate due to higher token pricing)
- **Per round**: How much did each round cost? (Useful for spotting anomalies)
- **Daily cumulative**: Are we on track to stay under budget? (The cumulative line should stay below the cap reference)

---

## Architecture

```
Vercel Cron                        Polymarket Gamma API       OpenRouter API
(rounds 2x/day,                    (public, no auth)          (API key required)
 settle every 4h,                        |                         |
 cohort weekly)                          v                         v
      |                           polymarket.ts              openrouter.ts
      |                           (fetch, filter, sync,      (call models, plugins web
      v                            check resolution,          search, re-eval context,
  cost-tracker.ts                  voided detection)          structured output, retry)
  ($100 budget cap,                      |                         |
   per-model/round costs)               v                         v
      |                           markets table  <-->      prediction.ts
      v                           (Turso/libSQL)            (orchestrate rounds:
  Cron route handlers                                        select markets, prompt
  (auth via CRON_SECRET)                                     all 6 models, compute
                                                             ensemble, store bets)
                                                                   |
                                                                   v
                                                              bets table
                                                              (full audit trail)
                                                                   |
                                                                   v
                                                             settlement.ts
                                                             (check resolution,
                                                              voided market refunds,
                                                              settle passes,
                                                              cohort lifecycle,
                                                              calculate P&L + Brier)
                                                                   |
                                                                   v
                                                              scoring.ts
                                                              (leaderboard, Brier
                                                               decomposition, market
                                                               difficulty, stats)
                                                                   |
                                                                   v
                                                             correlation.ts
                                                             (Jaccard similarity,
                                                              cluster detection,
                                                              adjusted P&L)
                                                                   |
                                                                   v
                                                              Next.js UI
                                                              (10 pages, shadcn/ui,
                                                               Recharts, dark mode)
```

### Key Design Decisions

- **Turso/libSQL** (not Postgres): SQLite-compatible edge database. Uses local `file:` URL for development, Turso cloud for production on Vercel. Zero-config locally, scalable in production.
- **OpenRouter** (not direct APIs): Single integration point for 6 different model providers. Unified billing, web search via `plugins` API, structured output.
- **Plugins web search** (not `:online` suffix): The `plugins: [{ id: "web", max_results: 5 }]` approach doesn't change model routing, unlike the `:online` suffix which may silently swap to different model versions.
- **Weekly cohorts with settling**: Fresh bankrolls prevent early luck from compounding. Cohorts go `active` → `settling` → `completed`, allowing bets to resolve across cohort boundaries (markets can take 1-60 days).
- **Ensemble model**: A virtual 7th model that aggregates the 6 independent forecasts at zero API cost. Tests the "wisdom of crowds" hypothesis.
- **Re-evaluation context**: Models see their previous bets on the same market within the cohort, enabling belief updating.
- **Voided market handling**: Markets that resolve as N/A get full refunds, no Brier impact, and are excluded from win rate.
- **Correlated market detection**: Jaccard similarity clusters related markets to prevent amplified P&L swings from a single event.
- **temperature: 0**: All models use deterministic output for reproducibility. Same inputs should produce same outputs.
- **Full logging**: Every bet stores the exact prompt and raw response. Any result can be audited or reproduced.
- **$100 budget cap**: Hard limit on total API spend prevents runaway costs. Checked before every round.

---

## Running Locally

### Prerequisites
- Node.js 20+
- OpenRouter API key ([get one here](https://openrouter.ai/keys))

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

# Database (omit for local file-based SQLite)
# TURSO_DATABASE_URL=libsql://your-db.turso.io
# TURSO_AUTH_TOKEN=your-token
```

### Start
```bash
npm run dev
```

The database (`db/arena.db`) is created automatically on first request with all tables and the 7 seeded models (6 LLMs + ensemble).

### Usage Flow
1. Open http://localhost:3000
2. Go to **Arena** page
3. Click **New Round** (auto-creates cohort + fetches markets + runs all 6 models)
4. Wait 30-90 seconds for all API calls to complete
5. View results on **Rounds** page (side-by-side model comparison)
6. Click **Settle Markets** to check for resolved markets and compute P&L
7. Check the **Leaderboard** for updated standings

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rounds` | Trigger a new betting round |
| GET | `/api/rounds` | List all rounds |
| GET | `/api/rounds/[id]` | Round detail with all bets |
| POST | `/api/cohorts` | Create a new weekly cohort |
| GET | `/api/cohorts` | List all cohorts |
| GET | `/api/cohorts/[id]` | Cohort detail with leaderboard |
| POST | `/api/settle` | Settle resolved markets |
| POST | `/api/markets` | Sync markets from Polymarket |
| GET | `/api/markets` | List cached markets |
| GET | `/api/leaderboard` | Computed leaderboard stats |
| GET | `/api/costs` | Cost summary (budget, per-model, per-round, daily) |
| GET | `/api/cron/round` | Automated round trigger (requires CRON_SECRET) |
| GET | `/api/cron/settle` | Automated settlement (requires CRON_SECRET) |
| GET | `/api/cron/cohort` | Automated cohort rotation (requires CRON_SECRET) |

---

## Deploying to Vercel

### 1. Create a Turso Database

The app uses [Turso](https://turso.tech) (SQLite-compatible edge database) for production. Local development uses a file-based SQLite database automatically.

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create arena

# Get connection URL
turso db show arena --url

# Create auth token
turso db tokens create arena
```

### 2. Set Environment Variables

In the Vercel dashboard (Settings > Environment Variables), add:

| Variable | Value | Required |
|----------|-------|----------|
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | Yes |
| `TURSO_DATABASE_URL` | `libsql://arena-your-org.turso.io` | Yes |
| `TURSO_AUTH_TOKEN` | Token from `turso db tokens create` | Yes |
| `CRON_SECRET` | Random secret (e.g., `openssl rand -hex 32`) | Yes |
| `BUDGET_CAP_USD` | `100` (or your preferred cap) | No (default: 100) |

### 3. Deploy

```bash
# Via Vercel CLI
vercel deploy --prod

# Or connect your GitHub repo in the Vercel dashboard
```

### What Happens After Deployment

1. **First request** initializes the database schema (all `CREATE TABLE IF NOT EXISTS`) and seeds the 7 models (6 LLMs + ensemble)
2. **Cron jobs start automatically** on the Vercel schedule:
   - Rounds at 10:00 and 22:00 UTC daily
   - Settlement every 4 hours
   - New cohort every Monday at 00:00 UTC
3. **Budget cap enforced** -- rounds stop automatically when $100 (or your configured cap) is reached
4. **Cost dashboard** on the Arena page tracks spending in real-time

### Vercel Cron Configuration

The `vercel.json` file defines the cron schedules:

```json
{
  "crons": [
    { "path": "/api/cron/round", "schedule": "0 10,22 * * *" },
    { "path": "/api/cron/settle", "schedule": "0 */4 * * *" },
    { "path": "/api/cron/cohort", "schedule": "0 0 * * 1" }
  ]
}
```

Vercel automatically passes the `CRON_SECRET` as a Bearer token to these endpoints. The Pro plan supports cron jobs (Hobby plan has limited cron).

---

## Options to Consider / Future Enhancements

### Scoring Alternatives

| Option | Current | Alternative | Trade-off |
|--------|---------|-------------|-----------|
| **Scoring rule** | Brier Score | Log Score (logarithmic scoring rule) | Log score penalizes extreme miscalibration more harshly (saying 99% and being wrong is catastrophic). Brier is more forgiving and easier to interpret. |
| **P&L model** | Binary outcome contracts | Continuous payoff functions | Current model is all-or-nothing. Could model partial payoffs based on how close the prediction was. |
| **Bet sizing** | Model decides (1-25%) | Fixed Kelly criterion | Remove model discretion -- always bet what Kelly says. Tests pure calibration, not risk management. |
| **Pass scoring** | No P&L impact | Opportunity cost penalty | Currently passing is free. Could penalize models for missing profitable opportunities. |

### Prompt Engineering

| Option | Current | Alternative | Trade-off |
|--------|---------|-------------|-----------|
| **Prompt style** | Single-turn with instructions | Multi-turn with examples (few-shot) | Few-shot might improve structured output compliance but adds token cost and could bias predictions. |
| **Chain of thought** | Reasoning in output JSON | Separate CoT step then prediction | Could let models "think" in a scratchpad before committing. More expensive but might improve quality. |
| **Market context** | Question + price + volume | Add historical price charts, news summaries | More context = better predictions, but much higher token cost. |
| **Persona variation** | Identical prompt for all | Model-specific personas | Could tailor prompts to each model's strengths. But breaks the "identical conditions" principle. |

### Market Selection

| Option | Current | Alternative | Trade-off |
|--------|---------|-------------|-----------|
| **Pool size** | Top 100 by volume | Top 500 (like Forecaster Arena) | More markets = more diversity, but many low-volume markets have unreliable prices. |
| **Selection** | Volume-weighted top N | Random sample from qualified pool | Random removes volume bias but might include low-quality markets. |
| **Categories** | All categories mixed | Category-balanced (equal politics, crypto, sports) | Would test models across domains equally, but some categories have few markets. |
| **Correlation** | **Detected via Jaccard similarity** | ~~Filter correlated markets~~ | **Implemented.** Adjusted P&L deduplicates correlated bets. |
| **Resolution speed** | 1-60 day horizon | Short-only (1-7 days) or long-only (30-90 days) | Short = faster feedback, long = deeper reasoning. Could run separate benchmarks. |

### Model Configuration

| Option | Current | Alternative | Trade-off |
|--------|---------|-------------|-----------|
| **Temperature** | 0 (deterministic) | 0.3-0.7 (some randomness) | temp=0 is reproducible but might produce overconfident predictions. Some randomness could improve diversity. |
| **Web search** | Always on (`plugins` API) | Optional / model decides | Some models might perform better without web search noise. Could test both. |
| **Max tokens** | 1024 | 2048-4096 | More tokens = longer reasoning, but adds cost. Most predictions don't need >500 tokens. |
| **Reasoning models** | Standard chat mode | Enable extended thinking (o3, DeepSeek-R1) | Reasoning models might produce better calibrated predictions at 5-10x cost. |

### Bankroll & Risk Management

| Option | Current | Alternative | Trade-off |
|--------|---------|-------------|-----------|
| **Starting bankroll** | $10,000/cohort | Varying amounts | Could test if models adapt bet sizing to different bankroll levels. |
| **Bet size cap** | 25% of bankroll | 10% cap (more conservative) | Lower cap reduces variance but also reduces differentiation. |
| **Bankruptcy handling** | Bankroll can go to 0 | Floor at $1,000 | A floor ensures continued participation but removes risk management pressure. |
| **Position limits** | No limit per market (but re-eval context shown) | Max 1 bet per market per model | Models see their previous bets and can update positions. |

### Additional Metrics Worth Tracking

| Metric | Description | Why Consider |
|--------|-------------|-------------|
| **Sharpe Ratio** | Risk-adjusted returns | Rewards consistent profits over volatile swings |
| **Max Drawdown** | Largest peak-to-trough loss | Shows worst-case risk tolerance |
| **Information Ratio** | Alpha per unit of tracking error | Measures value vs. just following market prices |
| **Edge Consistency** | % of bets where model had actual edge | Raw measure of information advantage |
| **Category Performance** | Brier/P&L by market category | Reveals domain strengths (politics vs. crypto vs. sports) |
| **Speed vs. Accuracy** | Latency-adjusted scoring | Does a 3s response predict as well as a 30s one? |
| **Cost Efficiency** | P&L per dollar of API cost | Grok at $0.001/call making $50 is better than GPT-5.2 at $0.015/call making $55 |

### Infrastructure Improvements

| Option | Current | Alternative | Trade-off |
|--------|---------|-------------|-----------|
| **Database** | Turso/libSQL (edge SQLite) | PostgreSQL (Neon, Supabase) | Turso is SQLite-compatible and zero-config. Postgres offers more advanced queries and ecosystem. |
| **Scheduling** | Vercel Cron (2x daily rounds, 4h settlement) | More frequent rounds (4x daily) or adaptive scheduling | More rounds = more data but higher cost. Could trigger rounds only when new high-volume markets appear. |
| **Monitoring** | Cost dashboard on Arena page | External alerts (Slack, email) on failures/cost spikes | Production should alert on model failures or unexpected costs. |
| **Multi-region** | Single Turso DB | Turso embedded replicas at the edge | Lower latency for reads, same write performance. Useful if adding a public-facing dashboard. |

### Research Extensions

| Extension | Description |
|-----------|-------------|
| **Prompt ablation study** | Test different prompt styles and measure impact on calibration |
| **Web search impact** | Run with and without search. How much does search improve predictions? |
| **Model agreement analysis** | When do all models agree vs. disagree? Are disagreements informative? |
| **Confidence calibration curves** | Plot stated confidence vs. actual outcomes per model. Perfect = diagonal. |
| **Market efficiency test** | Do any models consistently beat the market? Implications for market efficiency theory. |
| **Ensemble predictions** | **Implemented.** Virtual 7th model aggregates all 6 predictions via majority vote + mean probability. |
| **Temporal decay** | Do predictions made further from resolution date perform worse? |

---

## References

- [Forecaster Arena](https://forecasterarena.com) -- prior art and inspiration ([GitHub](https://github.com/setrf/forecasterarena))
- [Brier Score (Wikipedia)](https://en.wikipedia.org/wiki/Brier_score) -- the calibration metric
- [Kelly Criterion (Wikipedia)](https://en.wikipedia.org/wiki/Kelly_criterion) -- optimal bet sizing theory
- [Polymarket Gamma API](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [OpenRouter Docs](https://openrouter.ai/docs/quickstart)
- [OpenRouter Web Search Plugin](https://openrouter.ai/docs/guides/features/plugins/web-search)
- [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs)

---

*Research project. Not financial advice. No real money is wagered.*
