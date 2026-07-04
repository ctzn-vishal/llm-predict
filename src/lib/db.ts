import { createClient, type Client, type Transaction, type ResultSet } from "@libsql/client";

// ---------------------------------------------------------------------------
// Client singleton -- supports both local file (dev) and Turso (production)
// ---------------------------------------------------------------------------
let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL ?? "file:db/arena.db";
    _client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Schema (embedded for portability -- works on Vercel without filesystem)
// ---------------------------------------------------------------------------
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    openrouter_id TEXT NOT NULL,
    avatar_emoji TEXT DEFAULT '🤖',
    color TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS cohorts (
    id TEXT PRIMARY KEY,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    market_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS cohort_models (
    cohort_id TEXT NOT NULL REFERENCES cohorts(id),
    model_id TEXT NOT NULL REFERENCES models(id),
    bankroll REAL DEFAULT 10000.0,
    PRIMARY KEY (cohort_id, model_id)
  )`,
  `CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    description TEXT,
    slug TEXT,
    condition_id TEXT,
    yes_price REAL,
    no_price REAL,
    volume_24h REAL,
    end_date TEXT,
    category TEXT,
    resolved INTEGER DEFAULT 0,
    resolved_at TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS rounds (
    id TEXT PRIMARY KEY,
    cohort_id TEXT NOT NULL REFERENCES cohorts(id),
    market_ids TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id TEXT NOT NULL REFERENCES models(id),
    market_id TEXT NOT NULL REFERENCES markets(id),
    cohort_id TEXT NOT NULL REFERENCES cohorts(id),
    round_id TEXT NOT NULL REFERENCES rounds(id),
    action TEXT NOT NULL,
    confidence REAL,
    bet_size_pct REAL,
    bet_amount REAL,
    estimated_probability REAL,
    market_price_at_bet REAL,
    reasoning TEXT,
    key_factors TEXT,
    prompt_text TEXT,
    raw_response TEXT,
    settled INTEGER DEFAULT 0,
    pnl REAL DEFAULT 0,
    brier_score REAL,
    api_cost REAL DEFAULT 0,
    api_latency_ms INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bets_model ON bets(model_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bets_cohort ON bets(cohort_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bets_settled ON bets(settled)`,
  `CREATE INDEX IF NOT EXISTS idx_markets_resolved ON markets(resolved)`,
  `CREATE INDEX IF NOT EXISTS idx_rounds_cohort ON rounds(cohort_id)`,
  // -------------------------------------------------------------------------
  // forecasts: the redesigned mechanic (blind probability forecasts).
  // One row per (round, market, forecaster). Forecasters = the 6 models, plus
  // the synthetic 'ensemble' (mean) and 'crowd' (market price baseline).
  // Failures are VISIBLE: ok=0 with an `error` reason -- never coerced to a pass.
  // -------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id TEXT NOT NULL,
    cohort_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    forecaster_id TEXT NOT NULL,
    forecaster_kind TEXT NOT NULL DEFAULT 'model',  -- 'model' | 'ensemble' | 'crowd'
    prob_yes REAL,                                   -- forecast P(YES), [0,1]
    reasoning TEXT,
    key_factors TEXT,                                -- JSON array
    crowd_price REAL,                                -- market YES price at forecast time (hidden from models)
    prompt_text TEXT,
    raw_response TEXT,
    ok INTEGER NOT NULL DEFAULT 0,                   -- 1 = valid forecast produced
    error TEXT,                                      -- failure reason when ok=0
    api_cost REAL DEFAULT 0,
    api_latency_ms INTEGER DEFAULT 0,
    settled INTEGER NOT NULL DEFAULT 0,
    outcome INTEGER,                                 -- 1=yes, 0=no (NULL until resolved/void)
    brier REAL,                                      -- (prob_yes - outcome)^2
    log_loss REAL,                                   -- -[y*ln p + (1-y)*ln(1-p)]
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_forecasts_round ON forecasts(round_id)`,
  `CREATE INDEX IF NOT EXISTS idx_forecasts_market ON forecasts(market_id)`,
  `CREATE INDEX IF NOT EXISTS idx_forecasts_forecaster ON forecasts(forecaster_id)`,
  `CREATE INDEX IF NOT EXISTS idx_forecasts_cohort ON forecasts(cohort_id)`,
  `CREATE INDEX IF NOT EXISTS idx_forecasts_settled ON forecasts(settled)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_forecasts_unique ON forecasts(round_id, market_id, forecaster_id)`,
];

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
// Refreshed 2026-05: cheap, current, provider-diverse models verified on
// OpenRouter. Plus two synthetic forecasters: 'ensemble' (mean of the models)
// and 'crowd' (the Polymarket price, our baseline to beat).
const MODELS = [
  {
    id: "deepseek-v4-flash",
    display_name: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    openrouter_id: "deepseek/deepseek-v4-flash",
    avatar_emoji: "🔮",
    color: "#FF6B35",
  },
  {
    id: "qwen3-235b",
    display_name: "Qwen3 235B",
    provider: "Alibaba",
    openrouter_id: "qwen/qwen3-235b-a22b-2507",
    avatar_emoji: "🐲",
    color: "#06B6D4",
  },
  {
    id: "seed-1.6-flash",
    display_name: "Seed 1.6 Flash",
    provider: "ByteDance",
    openrouter_id: "bytedance-seed/seed-1.6-flash",
    avatar_emoji: "🌱",
    color: "#EC4899",
  },
  {
    id: "gpt-4.1-mini",
    display_name: "GPT-4.1 Mini",
    provider: "OpenAI",
    openrouter_id: "openai/gpt-4.1-mini",
    avatar_emoji: "🧠",
    color: "#10A37F",
  },
  {
    id: "gemini-3.1-flash-lite",
    display_name: "Gemini 3.1 Flash Lite",
    provider: "Google",
    openrouter_id: "google/gemini-3.1-flash-lite",
    avatar_emoji: "💎",
    color: "#4285F4",
  },
  {
    id: "mistral-small-3.2",
    display_name: "Mistral Small 3.2",
    provider: "Mistral",
    openrouter_id: "mistralai/mistral-small-3.2-24b-instruct",
    avatar_emoji: "🌀",
    color: "#8B5CF6",
  },
  {
    id: "ensemble",
    display_name: "Ensemble",
    provider: "Aggregate",
    openrouter_id: "ensemble",
    avatar_emoji: "🎯",
    color: "#F59E0B",
  },
  {
    id: "hybrid",
    display_name: "Market × Models",
    provider: "Aggregate",
    openrouter_id: "hybrid",
    avatar_emoji: "⚡",
    color: "#F43F5E",
  },
  {
    id: "crowd",
    display_name: "The Crowd",
    provider: "Polymarket",
    openrouter_id: "crowd",
    avatar_emoji: "👥",
    color: "#94A3B8",
  },
];

// ---------------------------------------------------------------------------
// Auto-init (once per process, cached via promise)
// ---------------------------------------------------------------------------
let _initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!_initPromise) {
    _initPromise = doInit().catch((e) => {
      _initPromise = null; // allow retry on transient failure
      throw e;
    });
  }
  return _initPromise;
}

async function doInit(): Promise<void> {
  const c = getClient();
  for (const sql of SCHEMA_STATEMENTS) {
    await c.execute(sql);
  }
  // Idempotent column additions for DBs created before a column existed.
  // CREATE TABLE IF NOT EXISTS won't alter an existing table, so a production
  // table that predates the column needs this explicit ALTER (guarded by a
  // PRAGMA check so it runs at most once).
  const columnMigrations = [
    { table: "markets", column: "category", ddl: "ALTER TABLE markets ADD COLUMN category TEXT" },
  ];
  for (const mig of columnMigrations) {
    const info = await c.execute(`PRAGMA table_info(${mig.table})`);
    const exists = info.rows.some(
      (r) => (r as unknown as { name: string }).name === mig.column,
    );
    if (!exists) await c.execute(mig.ddl);
  }
  for (const model of MODELS) {
    await c.execute({
      sql: `INSERT OR IGNORE INTO models (id, display_name, provider, openrouter_id, avatar_emoji, color)
            VALUES (@id, @display_name, @provider, @openrouter_id, @avatar_emoji, @color)`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      args: model as any,
    });
  }
}

// ---------------------------------------------------------------------------
// Async query helpers
// ---------------------------------------------------------------------------

export async function queryAll<T>(
  sql: string,
  params?: Record<string, unknown>,
  executor?: Client | Transaction,
): Promise<T[]> {
  await ensureInit();
  const ex = executor ?? getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await ex.execute(params ? { sql, args: params as any } : sql);
  return result.rows as unknown as T[];
}

export async function queryOne<T>(
  sql: string,
  params?: Record<string, unknown>,
  executor?: Client | Transaction,
): Promise<T | undefined> {
  const rows = await queryAll<T>(sql, params, executor);
  return rows[0];
}

export async function run(
  sql: string,
  params?: Record<string, unknown>,
  executor?: Client | Transaction,
): Promise<ResultSet> {
  await ensureInit();
  const ex = executor ?? getClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ex.execute(params ? { sql, args: params as any } : sql);
}

export async function transaction<T>(
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  await ensureInit();
  const c = getClient();
  const tx = await c.transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
