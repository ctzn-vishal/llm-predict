import { MarketCard } from "@/components/market-card";
import type { MarketRow } from "@/lib/schemas";

async function fetchMarkets(): Promise<MarketRow[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/markets`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function MarketsPage() {
  const markets = await fetchMarkets();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Polymarket prediction markets used in the arena
        </p>
      </div>

      {markets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No markets yet. Markets will be fetched when you run a round.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
