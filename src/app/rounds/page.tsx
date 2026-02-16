import { RoundFeed } from "@/components/round-feed";
import { queryAll } from "@/lib/db";
import type { RoundRow } from "@/lib/schemas";

export const dynamic = "force-dynamic";

async function getRounds(): Promise<RoundRow[]> {
  const rounds = await queryAll<RoundRow>(
    "SELECT * FROM rounds ORDER BY created_at DESC LIMIT 50"
  );
  return rounds;
}

export default async function RoundsPage() {
  const rounds = await getRounds();

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
