import { run, queryAll, transaction } from "@/lib/db";
import type { ForecastableMarket, GammaEvent, MarketRow } from "@/lib/schemas";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const ONE_DAY_MS = 86_400_000;
// The Gamma list endpoints cap a single response at 100, so we paginate. 6 pages
// (~600 events, ordered by 24h volume) reaches well past the sports-heavy top
// slice into the long tail of politics/geopolitics/crypto/econ markets.
const EVENT_PAGES = 6;

// ---------------------------------------------------------------------------
// Tag-based exclusions. We forecast GENUINELY-FUTURE world events, so the
// outcome is undetermined at forecast time and web search informs (rather than
// looks up) the answer.
//
//  * SPORTS is excluded by explicit design: a same-day game resolves in hours
//    and web search just fetches the box score -- that's lookup, not
//    forecasting. Crucially, individual games carry `sportsMarketType` but
//    championship FUTURES ("Will France win the World Cup?") do NOT, so we must
//    exclude on the parent event's TAGS to catch both.
//  * WEATHER / daily-temperature is a same-day recurring cluster (150+ markets)
//    that floods selection and is largely lookupable; excluded for the same
//    reason. Everything else -- politics, geopolitics, elections, crypto, econ,
//    finance, tech, ai, culture, science -- is kept.
// ---------------------------------------------------------------------------
const EXCLUDED_TAGS = new Set<string>([
  // sports (games AND futures both live under these category tags)
  "sports", "nba", "nfl", "mlb", "nhl", "soccer", "basketball", "baseball",
  "football", "tennis", "golf", "hockey", "ufc", "mma", "boxing", "cricket",
  "rugby", "f1", "formula 1", "racing", "nascar", "motorsports", "olympics",
  "epl", "la liga", "serie a", "bundesliga", "ligue 1", "champions league",
  "fifa world cup", "2026 fifa world cup", "games", "esports", "cs2", "league of legends",
  // weather (same-day daily-temperature flood)
  "weather", "temperature", "daily temperature", "highest temperature",
]);

// Structural / non-topical tags that exist for Polymarket plumbing, not as a
// human-readable category. Skipped when picking a market's display category.
const NONTOPIC_TAGS = new Set<string>([
  "recurring", "hide from new", "all", "weekly", "daily", "monthly", "hourly",
  "2024 predictions", "2025 predictions", "2026 predictions", "new", "trending",
  "featured", "popular",
]);

function eventTags(e: GammaEvent): string[] {
  return (Array.isArray(e.tags) ? e.tags : [])
    .map((t) => String(t?.label ?? t?.slug ?? "").toLowerCase().trim())
    .filter(Boolean);
}

function isExcludedEvent(e: GammaEvent): boolean {
  return eventTags(e).some(
    (t) => EXCLUDED_TAGS.has(t) || t.startsWith("rewards"),
  );
}

// First human-readable category tag, for display and the "what do we forecast"
// story (e.g. "iran", "crypto", "elections").
function primaryCategory(e: GammaEvent): string | null {
  return (
    eventTags(e).find(
      (t) => !EXCLUDED_TAGS.has(t) && !NONTOPIC_TAGS.has(t) && !t.startsWith("rewards"),
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Fetch events (with category tags + nested markets) from the Gamma API.
// We use /events rather than /markets specifically because only /events carries
// the `tags` we need to exclude sports futures.
// ---------------------------------------------------------------------------
export async function fetchEvents(pages = EVENT_PAGES): Promise<GammaEvent[]> {
  const out: GammaEvent[] = [];
  for (let i = 0; i < pages; i++) {
    const url = `${GAMMA_BASE}/events?closed=false&order=volume24hr&ascending=false&limit=100&offset=${i * 100}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Polymarket events API error: ${res.status} ${res.statusText}`);
    }
    const batch = (await res.json()) as GammaEvent[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 100) break; // last page
  }
  return out;
}

export interface MarketSelectOptions {
  count?: number;
  /** Skip markets that resolve sooner than this (need time to forecast first). */
  minHorizonDays?: number;
  /** Markets must resolve within this many days (keeps the feedback loop alive). */
  maxHorizonDays?: number;
  minVolume24h?: number;
  minPrice?: number;
  maxPrice?: number;
  /** Cap markets taken from a single event, for topic diversity. */
  maxPerEvent?: number;
}

// ---------------------------------------------------------------------------
// Select genuinely-future, non-sports markets from fetched events.
//
// We drop near-certain markets (price outside [0.05, 0.95]) -- those are
// "boring" for a calibration test because the crowd already knows the answer.
// We dedupe to `maxPerEvent` markets per event so a single multi-candidate event
// (e.g. an election with one market per candidate) can't dominate a round; this
// maximises topic diversity, which is what makes the "independent errors ->
// wisdom of crowds" comparison meaningful.
// ---------------------------------------------------------------------------
export function selectForecastableMarkets(
  events: GammaEvent[],
  opts: MarketSelectOptions = {},
): ForecastableMarket[] {
  const {
    count = 20,
    minHorizonDays = 1, // genuinely future: nothing that resolves today
    maxHorizonDays = 45, // still settles within ~6 weeks for the feedback loop
    minVolume24h = 500,
    minPrice = 0.05,
    maxPrice = 0.95,
    maxPerEvent = 1,
  } = opts;

  const now = Date.now();
  const minMs = minHorizonDays * ONE_DAY_MS;
  const maxMs = maxHorizonDays * ONE_DAY_MS;

  // Build a flat candidate list of (market, parent event) that pass all filters.
  const candidates: { market: ForecastableMarket; eventId: string; vol: number }[] = [];
  for (const e of events) {
    if (isExcludedEvent(e)) continue;
    const category = primaryCategory(e);
    const markets = Array.isArray(e.markets) ? e.markets : [];
    for (const m of markets) {
      if (!m || m.closed || m.active === false) continue;
      const vol = m.volume24hr ?? 0;
      if (vol < minVolume24h) continue;

      let yesPrice: number;
      try {
        yesPrice = parseFloat(JSON.parse(m.outcomePrices)[0]);
      } catch {
        continue;
      }
      if (!Number.isFinite(yesPrice) || yesPrice < minPrice || yesPrice > maxPrice) continue;

      const endIso = m.endDateIso ?? m.endDate ?? e.endDate;
      const endMs = new Date(endIso).getTime();
      if (Number.isNaN(endMs)) continue;
      const horizon = endMs - now;
      if (horizon < minMs || horizon > maxMs) continue;

      candidates.push({
        market: { ...m, endDateIso: endIso, category },
        eventId: String(e.id),
        vol,
      });
    }
  }

  // Highest 24h volume first, then take at most `maxPerEvent` per event.
  candidates.sort((a, b) => b.vol - a.vol);
  const perEvent = new Map<string, number>();
  const picked: ForecastableMarket[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    const n = perEvent.get(c.eventId) ?? 0;
    if (n >= maxPerEvent) continue;
    perEvent.set(c.eventId, n + 1);
    picked.push(c.market);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Sync markets from Polymarket into the database (the selection GATE: only
// genuinely-future, non-sports markets ever enter the DB).
// ---------------------------------------------------------------------------
export async function syncMarkets(): Promise<number> {
  const events = await fetchEvents();
  const cohort = selectForecastableMarkets(events);

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
