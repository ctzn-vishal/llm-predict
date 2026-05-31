import { ModelCard } from "@/components/model-card";
import { getLeaderboard } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const forecasters = await getLeaderboard();
  // Show the 6 models + the ensemble; the crowd is the baseline, not a competitor.
  const cards = forecasters.filter((f) => f.kind !== "crowd");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Six frontier LLMs making blind forecasts, plus the ensemble that averages them
        </p>
      </div>
      {cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No forecasts yet. Run a round in the Arena to get started.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((m) => (
            <ModelCard key={m.forecaster_id} model={m} />
          ))}
        </div>
      )}
    </div>
  );
}
