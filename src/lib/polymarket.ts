import { run, queryAll, transaction } from "@/lib/db";
import type { GammaEvent, GammaMarket, MarketRow } from "@/lib/schemas";

const GAMMA_BASE = "https://gamma-api.polymarket.com";

// ---------------------------------------------------------------------------
// Fetch top markets from Gamma API
// ---------------------------------------------------------------------------
export async function fetchMarkets(): Promise<GammaMarket[]> {
  const url = `${GAMMA_BASE}/markets?closed=false&order=volume24hr&ascending=false&limit=100&offset=0`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Polymarket API error: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Select a cohort of high-quality markets
// ---------------------------------------------------------------------------
export function selectCohortMarkets(
  allMarkets: GammaMarket[],
  count = 20,
): GammaMarket[] {
  const now = Date.now();
  const ONE_DAY = 86_400_000;
  const MIN_HORIZON_MS = 1 * ONE_DAY;
  const MAX_HORIZON_MS = 60 * ONE_DAY;

  const filtered = allMarkets.filter((m) => {
    if (!m.active || m.closed) return false;
    if (m.volume24hr <= 1000) return false;

    // Parse outcomePrices to get yes price
    let yesPrice: number;
    try {
      const prices: string[] = JSON.parse(m.outcomePrices);
      yesPrice = parseFloat(prices[0]);
    } catch {
      return false;
    }
    if (yesPrice < 0.05 || yesPrice > 0.95) return false;

    // Check end date horizon
    const endMs = new Date(m.endDateIso).getTime();
    const horizon = endMs - now;
    if (horizon < MIN_HORIZON_MS || horizon > MAX_HORIZON_MS) return false;

    return true;
  });

  // Sort by 24h volume descending, take top `count`
  filtered.sort((a, b) => b.volume24hr - a.volume24hr);
  return filtered.slice(0, count);
}

// ---------------------------------------------------------------------------
// Sync markets from Polymarket into the SQLite database
// ---------------------------------------------------------------------------
export async function syncMarkets(): Promise<number> {
  const allMarkets = await fetchMarkets();
  const cohort = selectCohortMarkets(allMarkets);

  await transaction(async (tx) => {
    for (const m of cohort) {
      let yesPrice = 0;
      let noPrice = 0;
      try {
        const prices: string[] = JSON.parse(m.outcomePrices);
        yesPrice = parseFloat(prices[0]);
        noPrice = parseFloat(prices[1]);
      } catch {
        // skip unparseable
      }

      await run(
        `INSERT OR REPLACE INTO markets
           (id, question, description, slug, condition_id,
            yes_price, no_price, volume_24h, end_date, fetched_at)
         VALUES
           (@id, @question, @description, @slug, @condition_id,
            @yes_price, @no_price, @volume_24h, @end_date, datetime('now'))`,
        {
          id: String(m.id),
          question: m.question,
          description: m.description ?? null,
          slug: m.slug ?? null,
          condition_id: m.conditionId ?? null,
          yes_price: yesPrice,
          no_price: noPrice,
          volume_24h: m.volume24hr,
          end_date: m.endDateIso ?? null,
        },
        tx,
      );
    }
  });

  return cohort.length;
}

// ---------------------------------------------------------------------------
// Check if a market has resolved
// ---------------------------------------------------------------------------
export async function checkResolution(
  marketId: string,
): Promise<{ resolved: boolean; outcome: "yes" | "no" | "voided" | null }> {
  // Try the events endpoint first (markets are nested under events)
  const url = `${GAMMA_BASE}/markets/${marketId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Polymarket API error checking resolution: ${res.status} ${res.statusText}`,
    );
  }
  const market = await res.json();

  if (!market.closed) {
    return { resolved: false, outcome: null };
  }

  // Determine outcome from outcomePrices: resolved markets settle to [1,0] or [0,1]
  let outcome: "yes" | "no" | "voided" | null = null;
  try {
    const prices: string[] = JSON.parse(market.outcomePrices);
    const yesPrice = parseFloat(prices[0]);
    if (yesPrice >= 0.99) outcome = "yes";
    else if (yesPrice <= 0.01) outcome = "no";
  } catch {
    // cannot determine outcome
  }

  // Market is closed but no clear yes/no resolution => voided
  if (outcome === null) {
    outcome = "voided";
  }

  return { resolved: true, outcome };
}

// ---------------------------------------------------------------------------
// Helper: get active (unresolved) markets from DB
// ---------------------------------------------------------------------------
export async function getActiveMarkets(limit = 100): Promise<MarketRow[]> {
  return await queryAll<MarketRow>(
    `SELECT * FROM markets WHERE resolved = 0 ORDER BY volume_24h DESC LIMIT @limit`,
    { limit },
  );
}

// ---------------------------------------------------------------------------
// Helper: get all markets from DB
// ---------------------------------------------------------------------------
export async function getAllMarkets(limit = 100): Promise<MarketRow[]> {
  return await queryAll<MarketRow>(
    `SELECT * FROM markets ORDER BY fetched_at DESC LIMIT @limit`,
    { limit },
  );
}
