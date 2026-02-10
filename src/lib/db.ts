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
];

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const MODELS = [
  {
    id: "gemini-3-flash",
    display_name: "Gemini 3 Flash",
    provider: "Google",
    openrouter_id: "google/gemini-3-flash-preview",
    avatar_emoji: "💎",
    color: "#4285F4",
  },
  {
    id: "grok-4.1-fast",
    display_name: "Grok 4.1 Fast",
    provider: "xAI",
    openrouter_id: "x-ai/grok-4.1-fast",
    avatar_emoji: "⚡",
    color: "#8B5CF6",
  },
  {
    id: "gpt-5.2-chat",
    display_name: "GPT-5.2 Chat",
    provider: "OpenAI",
    openrouter_id: "openai/gpt-5.2-chat",
    avatar_emoji: "🧠",
    color: "#10A37F",
  },
  {
    id: "deepseek-v3.2",
    display_name: "DeepSeek V3.2",
    provider: "DeepSeek",
    openrouter_id: "deepseek/deepseek-v3.2",
    avatar_emoji: "🔮",
    color: "#FF6B35",
  },
  {
    id: "kimi-k2.5",
    display_name: "Kimi K2.5",
    provider: "Moonshot AI",
    openrouter_id: "moonshotai/kimi-k2.5",
    avatar_emoji: "🌙",
    color: "#EC4899",
  },
  {
    id: "qwen-3",
    display_name: "Qwen 3",
    provider: "Alibaba",
    openrouter_id: "qwen/qwen3-235b-a22b",
    avatar_emoji: "🐲",
    color: "#06B6D4",
  },
  {
    id: "ensemble",
    display_name: "Ensemble (Avg)",
    provider: "Aggregate",
    openrouter_id: "ensemble",
    avatar_emoji: "🎯",
    color: "#F59E0B",
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
