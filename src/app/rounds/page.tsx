import { RoundFeed } from "@/components/round-feed";
import type { RoundRow } from "@/lib/schemas";

async function fetchRounds(): Promise<RoundRow[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/rounds`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.rounds ?? [];
  } catch {
    return [];
  }
}

export default async function RoundsPage() {
  const rounds = await fetchRounds();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rounds</h1>
        <p className="text-sm text-muted-foreground mt-1">
          History of all prediction rounds across cohorts
        </p>
      </div>
      <RoundFeed rounds={rounds} />
    </div>
  );
}
