# LLM Prediction Arena — Claude Code Build Spec v2

> **What this is:** A complete build spec for Claude Code to implement a Next.js 16 web app where frontier LLMs compete on real Polymarket prediction markets, scored on both calibration (Brier Score) and value (Portfolio P&L). Designed as an academic-grade benchmark where reality is the ultimate judge.
>
> **Key insight (from [Forecaster Arena](https://forecasterarena.com)):** Unlike traditional LLM benchmarks contaminated by training data, prediction markets test *genuine forecasting ability* about future events that cannot exist in any training corpus.

---

## 0. Skills to Install First

Before writing any code, install these skills:

```bash
# Essential — Next.js best practices (RSC boundaries, file conventions, async patterns, directives)
npx skills add vercel-labs/next-skills --skill next-best-practices

# Next.js 16 cache components and PPR
npx skills add vercel-labs/next-skills --skill next-cache-components

# Find more skills as needed
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

Use `npx skills find <query>` to discover additional skills for shadcn/ui, Tailwind v4, Recharts, etc. as you encounter needs.

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | **Next.js 16** (App Router, Turbopack, React 19) |
| Language | **TypeScript** (strict mode) |
| Styling | **Tailwind CSS v4** + **shadcn/ui** (new-york style, OKLCH colors) |
| Charts | **Recharts** for leaderboard charts, calibration plots, portfolio curves |
| Database | **SQLite** via `better-sqlite3` (local dev) — simple, no external deps |
| LLM Gateway | **OpenRouter** API (`https://openrouter.ai/api/v1/chat/completions`) |
| Market Data | **Polymarket Gamma API** (`https://gamma-api.polymarket.com`) |
| Scheduling | Next.js Route Handlers + cron (Vercel Cron or `node-cron` for local) |

---

## 2. OpenRouter Configuration

### API Endpoint
```
POST https://openrouter.ai/api/v1/chat/completions
```

### Authentication
```typescript
headers: {
  "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://llm-prediction-arena.vercel.app",
  "X-Title": "LLM Prediction Arena"
}
```

### The 7 Competing Models

> **Design principle (from Forecaster Arena):** Include frontier models from diverse providers for a comprehensive benchmark. All models receive identical prompts and conditions.

| # | Model | Provider | OpenRouter ID | Notes |
|---|-------|----------|--------------|-------|
| 1 | **Gemini 3 Flash** | Google | `google/gemini-3-flash-preview` | $0.50/$3.00 per 1M tokens, 1M context, configurable reasoning |
| 2 | **Grok 4.1 Fast** | xAI | `x-ai/grok-4.1-fast` | 2M context, agentic tool calling optimized |
| 3 | **GPT-4.1 Mini** | OpenAI | `openai/gpt-4.1-mini-2025-04-14` | $0.40/$1.60 per 1M tokens |
| 4 | **DeepSeek V3.2** | DeepSeek | `deepseek/deepseek-v3.2` | $0.25/$0.38 per 1M tokens, 164K context |
| 5 | **Claude Sonnet 4** | Anthropic | `anthropic/claude-sonnet-4` | Anthropic's balanced model |
| 6 | **Kimi K2** | Moonshot AI | `moonshotai/kimi-k2` | Chinese frontier model |
| 7 | **Qwen 3** | Alibaba | `qwen/qwen3-235b-a22b` | Large MoE model |

> **Note:** Verify exact model IDs on OpenRouter before implementation. Models 5-7 are new additions; confirm availability and pricing. If a model is unavailable, skip it for that cohort and log the reason.

### Web Search Plugin (Exa.ai-backed)
```typescript
plugins: [{ id: "web", max_results: 5 }]
```

### Structured Output Schema
```typescript
response_format: {
  type: "json_schema",
  json_schema: {
    name: "prediction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        action:                { type: "string", enum: ["bet_yes", "bet_no", "pass"] },
        confidence:            { type: "number", minimum: 0, maximum: 1 },
        bet_size_pct:          { type: "number", minimum: 1, maximum: 25 },
        estimated_probability: { type: "number", minimum: 0, maximum: 1 },
        reasoning:             { type: "string" },
        key_factors:           { type: "array", items: { type: "string" } }
      },
      required: ["action", "confidence", "bet_size_pct", "estimated_probability", "reasoning", "key_factors"],
      additionalProperties: false
    }
  }
}
```

### Reproducibility Settings

> **Lesson from Forecaster Arena:** Use `temperature: 0` for all models so results are deterministic and reproducible. Log every prompt and response verbatim.

```typescript
// Standard settings for ALL models — ensures fair comparison
const STANDARD_PARAMS = {
  temperature: 0,
  max_tokens: 1024,
  // Do NOT set top_p or frequency_penalty — let each model use defaults
};
```

### System Prompt (Identical for All Models)

```
You are a professional forecaster competing in a prediction market tournament.

TASK: Analyze the given market and decide whether to bet YES, bet NO, or pass.

RULES:
1. You start each cohort with $10,000. Bet wisely — bankroll management matters.
2. Use web search to research current events relevant to this market.
3. Compare your estimated probability to the market price. Only bet when you have edge.
4. Use Kelly criterion principles for bet sizing: bigger edge = bigger bet.
5. Passing is smart when you have no informational edge. ~30-50% pass rate is healthy.
6. You are scored on BOTH calibration (Brier Score) and portfolio returns (P&L).
7. Your confidence should reflect your TRUE belief — you are penalized for miscalibration.

MARKET:
Question: {question}
Description: {description}
Current YES price: {yes_price} (implied probability: {yes_price * 100}%)
Current NO price: {no_price}
24h Volume: ${volume_24h}
Resolution date: {end_date}

Respond with your analysis as structured JSON.
```

---

## 3. Polymarket API Integration (Read-Only)

### Gamma API (Primary — Market Discovery)

**Base URL:** `https://gamma-api.polymarket.com`

#### Fetch Active Markets
```
GET /events?order=volume_num&ascending=false&closed=false&limit=100&offset=0
```

> **Lesson from Forecaster Arena:** Analyze a *large* pool of markets (they do top 500 by volume). We fetch the top 100 and let models pick from them, rather than pre-selecting 3-5.

Key query parameters:
- `closed=false` — only open markets
- `order=volume_num&ascending=false` — highest volume first
- `limit=100` — fetch top 100 markets per sync

#### Response Shape (per event)
```typescript
interface GammaEvent {
  id: string;
  title: string;           // Short title
  slug: string;
  description: string;     // Detailed description (can be long)
  markets: GammaMarket[];
  volume: number;          // Total volume
  startDate: string;
  endDate: string;
}

interface GammaMarket {
  id: number;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string;   // JSON string: '["0.65","0.35"]' (YES, NO)
  volume: number;
  volume24hr: number;
  active: boolean;
  closed: boolean;
  endDateIso: string;
  description: string;
}
```

#### Market Selection Criteria for Cohort

When selecting markets for a cohort, filter from the cached pool:

```typescript
function selectCohortMarkets(allMarkets: GammaMarket[], count: number = 20): GammaMarket[] {
  return allMarkets
    .filter(m => m.active && !m.closed)
    .filter(m => m.volume24hr > 1000)          // Minimum liquidity
    .filter(m => {
      const prices = JSON.parse(m.outcomePrices);
      const yesPrice = parseFloat(prices[0]);
      return yesPrice > 0.05 && yesPrice < 0.95; // Skip near-certain markets
    })
    .filter(m => {
      const endDate = new Date(m.endDateIso);
      const daysToResolution = (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysToResolution > 1 && daysToResolution < 60; // 1-60 day horizon
    })
    .sort((a, b) => b.volume24hr - a.volume24hr)
    .slice(0, count);
}
```

### CLOB API (Secondary — Real-time Prices)

**Base URL:** `https://clob.polymarket.com`

```
GET /prices?token_id={conditionId}
```

Use CLOB for real-time price checks during bet placement and settlement. Gamma API may lag.

### Caching Strategy
- Sync markets every **6 hours** (Gamma API, store in SQLite)
- Check resolution status every **1 hour** for markets with unsettled bets
- Cache aggressively — Polymarket rate limits are undocumented

---

## 4. Database Schema (SQLite)

Use `better-sqlite3` for zero-config local storage. Create a `db/` directory with migration files.

> **Key addition from Forecaster Arena:** The **cohort** system. Each weekly cohort gives every model a fresh $10K bankroll, creating natural comparison periods.

```sql
-- models: the competing LLMs
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,       -- 'Google', 'xAI', 'OpenAI', etc.
  openrouter_id TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🤖',
  color TEXT NOT NULL,          -- hex color for charts
  created_at TEXT DEFAULT (datetime('now'))
);

-- cohorts: weekly competition periods (fresh bankrolls each week)
CREATE TABLE cohorts (
  id TEXT PRIMARY KEY,          -- e.g. '2026-W06'
  start_date TEXT NOT NULL,     -- ISO date (Sunday 00:00 UTC)
  end_date TEXT NOT NULL,       -- following Sunday 00:00 UTC
  status TEXT DEFAULT 'active', -- active, completed, archived
  market_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- cohort_models: per-model state within a cohort
CREATE TABLE cohort_models (
  cohort_id TEXT NOT NULL REFERENCES cohorts(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  bankroll REAL DEFAULT 10000.0,
  PRIMARY KEY (cohort_id, model_id)
);

-- markets: cached Polymarket data
CREATE TABLE markets (
  id TEXT PRIMARY KEY,          -- Polymarket market ID
  question TEXT NOT NULL,
  description TEXT,
  slug TEXT,
  condition_id TEXT,            -- for CLOB API price lookups
  yes_price REAL,
  no_price REAL,
  volume_24h REAL,
  end_date TEXT,
  resolved INTEGER DEFAULT 0,  -- 0=open, 1=resolved_yes, 2=resolved_no
  resolved_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

-- bets: each model's bet on a market within a cohort
CREATE TABLE bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL REFERENCES models(id),
  market_id TEXT NOT NULL REFERENCES markets(id),
  cohort_id TEXT NOT NULL REFERENCES cohorts(id),
  round_id TEXT NOT NULL REFERENCES rounds(id),
  action TEXT NOT NULL,            -- 'bet_yes', 'bet_no', 'pass'
  confidence REAL,                 -- model's reported confidence [0,1]
  bet_size_pct REAL,               -- 1-25%
  bet_amount REAL,                 -- actual $ amount wagered
  estimated_probability REAL,      -- model's prob estimate [0,1]
  market_price_at_bet REAL,        -- YES price when bet was placed
  reasoning TEXT,                  -- model's reasoning text
  key_factors TEXT,                -- JSON array of factors
  prompt_text TEXT,                -- FULL prompt sent (for reproducibility)
  raw_response TEXT,               -- FULL raw API response (for reproducibility)
  settled INTEGER DEFAULT 0,
  pnl REAL DEFAULT 0,
  brier_score REAL,                -- calculated after resolution
  api_cost REAL DEFAULT 0,
  api_latency_ms INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- rounds: groups of bets on the same markets (within a cohort)
CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL REFERENCES cohorts(id),
  market_ids TEXT NOT NULL,        -- JSON array of market IDs
  status TEXT DEFAULT 'pending',   -- pending, in_progress, completed
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Seed the 7 Models

```typescript
const MODELS = [
  { id: "gemini-3-flash",  display_name: "Gemini 3 Flash",  provider: "Google",      openrouter_id: "google/gemini-3-flash-preview",       avatar_emoji: "💎", color: "#4285F4" },
  { id: "grok-4.1-fast",   display_name: "Grok 4.1 Fast",   provider: "xAI",         openrouter_id: "x-ai/grok-4.1-fast",                  avatar_emoji: "⚡", color: "#8B5CF6" },
  { id: "gpt-4.1-mini",    display_name: "GPT-4.1 Mini",    provider: "OpenAI",      openrouter_id: "openai/gpt-4.1-mini-2025-04-14",      avatar_emoji: "🧠", color: "#10A37F" },
  { id: "deepseek-v3.2",   display_name: "DeepSeek V3.2",   provider: "DeepSeek",    openrouter_id: "deepseek/deepseek-v3.2",               avatar_emoji: "🔮", color: "#FF6B35" },
  { id: "claude-sonnet-4", display_name: "Claude Sonnet 4",  provider: "Anthropic",   openrouter_id: "anthropic/claude-sonnet-4",            avatar_emoji: "🎭", color: "#D97706" },
  { id: "kimi-k2",         display_name: "Kimi K2",          provider: "Moonshot AI", openrouter_id: "moonshotai/kimi-k2",                   avatar_emoji: "🌙", color: "#EC4899" },
  { id: "qwen-3",          display_name: "Qwen 3",           provider: "Alibaba",     openrouter_id: "qwen/qwen3-235b-a22b",                avatar_emoji: "🐲", color: "#06B6D4" },
];
```

---

## 5. App Architecture (Next.js 16 App Router)

```
app/
├── layout.tsx              # Root layout with sidebar nav, dark mode
├── page.tsx                # Dashboard / Leaderboard (home)
├── globals.css             # Tailwind v4 + shadcn/ui tokens
│
├── arena/
│   └── page.tsx            # Live arena — trigger rounds, see active bets
│
├── cohorts/
│   ├── page.tsx            # All cohorts — timeline of weekly competitions
│   └── [id]/
│       └── page.tsx        # Single cohort — leaderboard, bets, markets for that week
│
├── markets/
│   └── page.tsx            # Browse all Polymarket markets (cached)
│
├── rounds/
│   ├── page.tsx            # History of all rounds
│   └── [id]/
│       └── page.tsx        # Single round detail — side-by-side reasoning
│
├── models/
│   ├── page.tsx            # All models overview grid
│   └── [id]/
│       └── page.tsx        # Individual model stats, bet history, calibration
│
├── methodology/
│   └── page.tsx            # Static page explaining scoring, rules, academic positioning
│
├── api/
│   ├── markets/
│   │   └── route.ts        # GET: fetch & cache markets from Polymarket
│   ├── cohorts/
│   │   ├── route.ts        # POST: create new cohort, GET: list cohorts
│   │   └── [id]/
│   │       └── route.ts    # GET: cohort details + leaderboard
│   ├── rounds/
│   │   ├── route.ts        # POST: trigger a new betting round within active cohort
│   │   └── [id]/
│   │       └── route.ts    # GET: round details
│   ├── settle/
│   │   └── route.ts        # POST: check resolved markets, settle bets, compute Brier
│   └── leaderboard/
│       └── route.ts        # GET: computed leaderboard (all-time + per-cohort)
│
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── leaderboard-table.tsx
│   ├── model-card.tsx
│   ├── market-card.tsx
│   ├── bet-comparison.tsx  # Side-by-side reasoning view
│   ├── calibration-chart.tsx
│   ├── bankroll-chart.tsx
│   ├── portfolio-chart.tsx # Portfolio value over time (per cohort)
│   ├── brier-breakdown.tsx # Brier score decomposition visualization
│   ├── cohort-timeline.tsx
│   ├── round-feed.tsx
│   └── nav-sidebar.tsx
│
├── lib/
│   ├── db.ts               # SQLite connection + typed query helpers
│   ├── openrouter.ts       # OpenRouter API client (temp=0, web search, structured output)
│   ├── polymarket.ts       # Polymarket Gamma API client
│   ├── prediction.ts       # Orchestrate a round: select markets → prompt models → collect bets
│   ├── settlement.ts       # Resolution logic + Brier score calculation
│   ├── scoring.ts          # Brier score, portfolio P&L, leaderboard stats computation
│   └── schemas.ts          # Zod schemas for validation
│
└── db/
    └── migrations/
        └── 001_init.sql
```

---

## 6. Core Flows

### Flow 0: Create a New Cohort (Weekly)

> **From Forecaster Arena:** Cohorts create clean comparison windows. Each model starts fresh with $10K.

1. **Cron fires Sunday 00:00 UTC** (or manual trigger from admin UI)
2. **`POST /api/cohorts`** handler:
   a. Create new cohort record with ISO week ID (e.g. `2026-W06`)
   b. For each model, create `cohort_models` entry with `bankroll = 10000.0`
   c. Sync latest markets from Polymarket Gamma API (top 100 by volume)
   d. Mark previous cohort as `completed`
3. Previous cohort's final standings are frozen

### Flow 1: Trigger a Betting Round (Within Active Cohort)

1. **User clicks "New Round"** on the Arena page (or cron triggers ~daily)
2. **`POST /api/rounds`** handler:
   a. Get the active cohort
   b. Select 10-20 markets from the cached pool using selection criteria
   c. Create a `round` record in DB
   d. For each market × each model (7 models × 10-20 markets = 70-140 API calls):
      - Build the prompt with market data (identical prompt text for all models)
      - Call OpenRouter with: `temperature: 0`, web search plugin, structured output
      - Log full prompt and raw response in the `bets` record
      - Parse response, validate with Zod
      - Calculate actual bet amount: `cohort_bankroll × (bet_size_pct / 100)`
      - Deduct from cohort bankroll (escrow)
      - Store bet in DB with `api_cost` and `api_latency_ms`
   e. Return round results
3. **Frontend updates** with the bets and reasoning

> **Important:** 70-140 API calls per round is substantial. Process models in parallel (all 7 models for one market at a time), with retry logic and a circuit breaker. Budget ~$2-5 per full round depending on market count.

### Flow 2: Settlement + Scoring

> **Dual scoring (from Forecaster Arena):** Both Brier Score (calibration quality) and Portfolio P&L (betting value). These measure different things — a model can be well-calibrated but timid, or aggressive but poorly calibrated.

1. **`POST /api/settle`** (cron hourly or manual):
   a. Query all unsettled bets
   b. For each unique market, check Polymarket for resolution
   c. If resolved:
      - Calculate P&L (see formula below)
      - **Calculate Brier Score for each bet** (see formula below)
      - Update cohort_models bankroll
      - Mark bet as settled with `pnl` and `brier_score`

### P&L Calculation

```typescript
function calculatePnL(
  action: 'bet_yes' | 'bet_no' | 'pass',
  betAmount: number,
  marketPriceAtBet: number, // YES price at time of bet (e.g. 0.65)
  resolvedOutcome: 'yes' | 'no'
): number {
  if (action === 'pass') return 0;

  const betOnYes = action === 'bet_yes';
  const resolvedYes = resolvedOutcome === 'yes';

  if (betOnYes && resolvedYes) {
    return betAmount * (1 / marketPriceAtBet - 1);
  } else if (betOnYes && !resolvedYes) {
    return -betAmount;
  } else if (!betOnYes && !resolvedYes) {
    return betAmount * (1 / (1 - marketPriceAtBet) - 1);
  } else {
    return -betAmount;
  }
}
```

### Brier Score Calculation

> **This is the key academic metric.** Brier score = mean squared error between the model's estimated probability and the actual binary outcome. Lower is better (0 = perfect, 0.25 = coin flip, 1 = always wrong).

```typescript
function calculateBrierScore(
  estimatedProbability: number, // model's p(YES)
  resolvedOutcome: 'yes' | 'no'
): number {
  const actual = resolvedOutcome === 'yes' ? 1 : 0;
  return (estimatedProbability - actual) ** 2;
}

// Aggregate Brier for a model across all resolved bets
function aggregateBrierScore(bets: { brier_score: number }[]): number {
  if (bets.length === 0) return 0;
  return bets.reduce((sum, b) => sum + b.brier_score, 0) / bets.length;
}
```

### Brier Score Decomposition (for Model Profile page)

Break Brier score into interpretable components:

```typescript
// Reliability: how well-calibrated are the confidence buckets?
// Resolution: how much do forecasts differ from the base rate?
// Uncertainty: base rate variance (same for all models on same markets)

interface BrierDecomposition {
  reliability: number;    // Lower = better calibrated
  resolution: number;     // Higher = more informative
  uncertainty: number;    // Fixed per dataset (not model-specific)
}

function decomposeBrier(
  bets: { estimated_probability: number; resolved_yes: boolean }[],
  nBuckets: number = 10
): BrierDecomposition {
  const N = bets.length;
  const baseRate = bets.filter(b => b.resolved_yes).length / N;
  const uncertainty = baseRate * (1 - baseRate);

  // Bucket forecasts into deciles
  const buckets = Array.from({ length: nBuckets }, () => ({ forecasts: [] as number[], outcomes: [] as number[] }));
  for (const bet of bets) {
    const idx = Math.min(Math.floor(bet.estimated_probability * nBuckets), nBuckets - 1);
    buckets[idx].forecasts.push(bet.estimated_probability);
    buckets[idx].outcomes.push(bet.resolved_yes ? 1 : 0);
  }

  let reliability = 0;
  let resolution = 0;
  for (const bucket of buckets) {
    if (bucket.forecasts.length === 0) continue;
    const nk = bucket.forecasts.length;
    const avgForecast = bucket.forecasts.reduce((a, b) => a + b, 0) / nk;
    const avgOutcome = bucket.outcomes.reduce((a, b) => a + b, 0) / nk;
    reliability += (nk / N) * (avgForecast - avgOutcome) ** 2;
    resolution += (nk / N) * (avgOutcome - baseRate) ** 2;
  }

  return { reliability, resolution, uncertainty };
  // BS = reliability - resolution + uncertainty
}
```

### Leaderboard Stats Computation

```typescript
interface ModelStats {
  model_id: string;
  // Portfolio metrics
  bankroll: number;
  total_pnl: number;
  roi_pct: number;
  // Calibration metrics
  brier_score: number;
  brier_reliability: number;
  brier_resolution: number;
  // Activity metrics
  total_bets: number;
  win_rate: number;
  pass_rate: number;
  avg_confidence: number;
  avg_bet_size: number;
  // Cost tracking
  total_api_cost: number;
}
```

---

## 7. UI Design Requirements

### Design Principles
- **Dark mode first** — prediction/trading aesthetic (Bloomberg terminal meets modern web)
- **Data-dense but clean** — lots of numbers, well-structured with hierarchy
- Use shadcn/ui components: `Card`, `Table`, `Badge`, `Button`, `Tabs`, `Dialog`, `Tooltip`, `Skeleton`
- **7 model colors** — each model gets a unique color for charts/badges
- Responsive: desktop-first but usable on mobile
- **Academic positioning** — clean, serious, not gamified

### shadcn/ui Setup
```bash
npx shadcn@latest init
# Select: New York style, Neutral base color
npx shadcn@latest add card table badge button tabs dialog tooltip skeleton separator avatar chart select
```

### Page Designs

#### Home / Leaderboard (`/`)
- **Hero stats row**: Cards showing leading model, total cohorts completed, active markets, total bets
- **Portfolio value over time** chart (Recharts `LineChart`) — one line per model, filterable by cohort
- **Leaderboard table** (shadcn Table):

  | Rank | Model | Provider | Bankroll | ROI % | Brier Score | Win Rate | Bets | Pass Rate |
  |------|-------|----------|----------|-------|-------------|----------|------|-----------|

  With colored avatar emoji + badge for each model. Sortable columns. Toggle between "Current Cohort" and "All Time".
- **Recent activity** feed — latest bets with reasoning preview and outcome

#### Arena (`/arena`)
- **Active cohort info** — current week, days remaining, market count
- **"New Round" button** — prominent, triggers betting round against active cohort
- **Active markets** grid — cards showing current Polymarket questions + odds
- **Live round progress** — when a round is running, show each model thinking (animated dots), then reveal bets one by one
- **Round results** — after completion, show a comparison table

#### Cohorts (`/cohorts`)

> **New page (from Forecaster Arena):** Timeline of all weekly competitions.

- **Cohort timeline** — chronological list of cohorts with mini-leaderboards
- Each card shows: week dates, winner, # markets, top 3 models by P&L and by Brier
- Click through to cohort detail page

#### Cohort Detail (`/cohorts/[id]`)
- **Cohort-specific leaderboard** — standings for just that week (P&L column + Brier column)
- **Portfolio chart** — bankroll curves for all 7 models through that week
- **Markets in this cohort** — all markets bet on, with resolution status
- **Round list** — all rounds within this cohort

#### Round Detail (`/rounds/[id]`)
- **Market info** at top — question, current odds, resolution status
- **Side-by-side comparison** of all 7 models' bets:
  - Each model in a column (horizontal scroll on mobile, or tabs)
  - Show: action (YES/NO/PASS badge), confidence bar, bet amount, estimated probability vs market price, reasoning text, key factors as tags
- **Outcome** section — if resolved, show who won/lost, P&L per model, and Brier scores

#### Models Overview (`/models`)
- **Grid of model cards** — each showing avatar, name, provider, current bankroll, Brier score, ROI
- Quick-compare mode: select 2-3 models to overlay their calibration charts

#### Model Profile (`/models/[id]`)
- **Stats header**: provider badge, bankroll, ROI, Brier score, win rate, total bets, avg confidence
- **Calibration chart** (Recharts): X-axis = confidence bucket (0-10%, 10-20%, ..., 90-100%), Y-axis = actual win rate in that bucket. Perfect calibration = diagonal line. This is the **signature academic chart**.
- **Brier decomposition** bar chart: reliability vs resolution vs uncertainty
- **Bet history** table with filters (by cohort, by outcome, by action)
- **Performance by market category** if categorizable

#### Methodology (`/methodology`)

> **New page (from Forecaster Arena):** Essential for academic credibility.

Static content page explaining:
1. Why prediction markets as a benchmark (can't memorize future events)
2. Market selection criteria
3. Prompt design (identical for all models, temp=0)
4. Dual scoring: Brier Score (calibration) + Portfolio P&L (value capture)
5. Brier decomposition methodology
6. Cohort structure and bankroll management
7. Data sources and update frequency
8. Limitations and known biases
9. Links to source code

### Color Palette per Model
```typescript
const MODEL_COLORS = {
  "gemini-3-flash":  { primary: "#4285F4", bg: "bg-blue-500/10",    text: "text-blue-400"    },
  "grok-4.1-fast":   { primary: "#8B5CF6", bg: "bg-violet-500/10",  text: "text-violet-400"  },
  "gpt-4.1-mini":    { primary: "#10A37F", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "deepseek-v3.2":   { primary: "#FF6B35", bg: "bg-orange-500/10",  text: "text-orange-400"  },
  "claude-sonnet-4": { primary: "#D97706", bg: "bg-amber-500/10",   text: "text-amber-400"   },
  "kimi-k2":         { primary: "#EC4899", bg: "bg-pink-500/10",    text: "text-pink-400"    },
  "qwen-3":          { primary: "#06B6D4", bg: "bg-cyan-500/10",    text: "text-cyan-400"    },
};
```

---

## 8. Implementation Order (MVP)

### Phase 1: Foundation
1. `npx create-next-app@latest llm-prediction-arena --typescript --tailwind --app --turbopack`
2. Install skills (see Section 0)
3. Set up shadcn/ui
4. Set up SQLite with `better-sqlite3`, run migrations
5. Create `lib/db.ts` with typed query helpers
6. Seed models table

### Phase 2: Data Layer
7. `lib/polymarket.ts` — fetch markets, parse responses, cache in DB
8. `lib/openrouter.ts` — generic completion client with structured output + web search
9. `lib/schemas.ts` — Zod schemas for all API responses and DB types
10. `api/markets/route.ts` — endpoint to fetch and store markets

### Phase 3: Core Game Loop
11. `lib/prediction.ts` — orchestrate a round: select markets → prompt models → collect bets → store
12. `api/cohorts/route.ts` — create/list cohorts, initialize cohort_models
13. `api/rounds/route.ts` — POST to trigger round within active cohort, GET to list
14. `lib/settlement.ts` — check resolution, calculate P&L
15. `lib/scoring.ts` — Brier score calculation, decomposition, leaderboard aggregation
16. `api/settle/route.ts` — settlement endpoint

### Phase 4: UI
17. Layout with sidebar navigation (shadcn `Sidebar` or custom)
18. Leaderboard page with dual-metric table + Recharts portfolio chart
19. Arena page with round trigger + live feed
20. Cohort timeline page + cohort detail page
21. Round detail page with 7-way side-by-side comparison
22. Model profile page with calibration chart + Brier decomposition
23. Models overview grid page
24. Methodology static page

### Phase 5: Polish
25. Loading states (Skeleton components)
26. Error handling and retry logic for API calls (exponential backoff on 429s)
27. Rate limiting awareness (OpenRouter and Polymarket both have limits)
28. Dark/light mode toggle
29. Responsive design pass
30. Prompt logging verification — ensure every bet has full prompt + response stored

---

## 9. Key Implementation Notes

### OpenRouter Error Handling
- OpenRouter returns standard OpenAI-format errors
- Handle rate limits (429) with exponential backoff
- Track `usage.prompt_tokens` and `usage.completion_tokens` from response to calculate API cost
- Store cost in `bets.api_cost` field
- **Log timing**: measure round-trip latency and store in `api_latency_ms`

### Polymarket Rate Limits
- Gamma API: undocumented but be conservative — cache aggressively, poll every 6 hours max for market discovery
- CLOB API: documented rate limits at `https://docs.polymarket.com/quickstart/introduction/rate-limits`
- Check resolution status more frequently (hourly) for markets with unsettled bets

### Structured Output Fallback
Some models may not perfectly support `json_schema` response format via OpenRouter. Fallback strategy:
1. Try `response_format: { type: "json_schema", json_schema: ... }`
2. If that fails, use `response_format: { type: "json_object" }` and validate with Zod
3. If that fails, parse JSON from the text response
4. If all fail, log the error and record the bet as a forced `pass`

### Model Availability Handling
- Not all 7 models may be available on OpenRouter at any given time
- Before each round, check model availability
- If a model is down, skip it for that round and log the reason
- Never block a round because one model is unavailable

### Reproducibility Guarantees
- **Temperature 0** for all models
- **Full prompt stored** in `bets.prompt_text` — the exact text sent to OpenRouter
- **Full response stored** in `bets.raw_response` — the complete JSON response
- **Timestamps** on everything
- **Immutable cohort data** — once a cohort completes, its data never changes

### Environment Variables
```
OPENROUTER_API_KEY=sk-or-v1-xxxxx
```

That's the only required env var. Everything else (Polymarket API) is public/unauthenticated.

---

## 10. Package Dependencies

```json
{
  "dependencies": {
    "next": "^16",
    "react": "^19",
    "react-dom": "^19",
    "better-sqlite3": "^11",
    "zod": "^3",
    "recharts": "^2",
    "lucide-react": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest",
    "date-fns": "^4",
    "nanoid": "^5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7",
    "@types/node": "^22",
    "@types/react": "^19",
    "typescript": "^5",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "tw-animate-css": "latest"
  }
}
```

---

## 11. Scoring Summary — The Two Axes

> This is the conceptual heart of the project. We measure two fundamentally different things:

### Axis 1: Calibration (Brier Score) — "Do you know what you know?"
- **Formula:** `BS = (1/N) × Σ(estimated_prob - actual_outcome)²`
- Range: 0 (perfect) to 1 (worst possible)
- Baseline: 0.25 (always guessing 50%)
- A model that says "70% chance" should be right ~70% of the time
- **Applies to ALL predictions**, including passes (where estimated_probability is still logged)
- Decomposition: Reliability (calibration error) - Resolution (informativeness) + Uncertainty (base rate variance)

### Axis 2: Portfolio Returns (P&L) — "Can you make money?"
- **Starting bankroll:** $10,000 per cohort
- A model might be well-calibrated but timid (small bets, low P&L)
- A model might be aggressive and occasionally brilliant (high P&L, poor Brier)
- **ROI%** = `(final_bankroll - 10000) / 10000 × 100`
- **Only applies to actual bets** (bet_yes / bet_no), not passes

### Combined Ranking
The leaderboard default sort is by **P&L within the current cohort**. But users can re-sort by Brier score to see who is most calibrated. The tension between these two axes is what makes the benchmark interesting.

---

## 12. Reference Links

- **Forecaster Arena (prior art):** https://forecasterarena.com — https://github.com/setrf/forecasterarena
- **OpenRouter Docs**: https://openrouter.ai/docs/quickstart
- **OpenRouter Tool Calling**: https://openrouter.ai/docs/guides/features/tool-calling
- **OpenRouter Web Search Plugin**: https://openrouter.ai/docs/guides/features/plugins/web-search
- **OpenRouter Structured Outputs**: https://openrouter.ai/docs/guides/features/structured-outputs
- **OpenRouter Model Pages**:
  - Gemini 3 Flash: https://openrouter.ai/google/gemini-3-flash-preview
  - Grok 4.1 Fast: https://openrouter.ai/x-ai/grok-4.1-fast
  - GPT-4.1 Mini: https://openrouter.ai/openai/gpt-4.1-mini-2025-04-14
  - DeepSeek V3.2: https://openrouter.ai/deepseek/deepseek-v3.2
  - Claude Sonnet 4: https://openrouter.ai/anthropic/claude-sonnet-4
  - Kimi K2: https://openrouter.ai/moonshotai/kimi-k2
  - Qwen 3: https://openrouter.ai/qwen/qwen3-235b-a22b
- **Polymarket Developer Quickstart**: https://docs.polymarket.com/quickstart/overview
- **Polymarket Gamma API (Fetch Markets)**: https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide
- **Polymarket Gamma API Structure**: https://docs.polymarket.com/developers/gamma-markets-api/gamma-structure
- **Polymarket CLOB API**: https://docs.polymarket.com/developers/CLOB/introduction
- **Polymarket API Rate Limits**: https://docs.polymarket.com/quickstart/introduction/rate-limits
- **Next.js Skills (vercel-labs)**: https://github.com/vercel-labs/next-skills
- **shadcn/ui**: https://ui.shadcn.com
- **shadcn/ui Tailwind v4 guide**: https://ui.shadcn.com/docs/tailwind-v4
- **Recharts**: https://recharts.org
- **Brier Score (Wikipedia)**: https://en.wikipedia.org/wiki/Brier_score

---

## Appendix: Changelog from v1 → v2

| Change | Rationale (from Forecaster Arena study) |
|--------|----------------------------------------|
| Added **cohort system** (weekly, fresh $10K bankrolls) | Clean comparison windows; prevents snowball effects where early luck compounds |
| Expanded from **4 → 7 models** (added Claude, Kimi, Qwen) | More providers = richer benchmark; Chinese models add diversity |
| Added **dual scoring axis** (Brier Score + P&L) | Calibration and value are different skills; measuring both is more informative |
| Increased market pool from **3-5 → 10-20 per round** | More markets per round = more data points per cohort |
| Added **`temperature: 0`** requirement | Reproducibility — same inputs should produce same outputs |
| Added **full prompt/response logging** in bets table | Academic-grade reproducibility; every decision can be audited |
| Added **Brier score decomposition** (reliability/resolution/uncertainty) | Diagnostic value — understand *why* a model scores well or poorly |
| Added **Methodology page** | Academic credibility and transparency |
| Added **Cohorts page** + cohort detail view | Navigate competition history by week |
| Added **Models overview page** | Grid view for comparing all 7 models at a glance |
| Added **model availability handling** | Graceful degradation when OpenRouter models go down |
| Added **provider field** to models table | Display provider name (Google, xAI, etc.) in UI |
| Moved from ad-hoc rounds to **structured weekly cadence** | Predictable schedule makes results comparable |
