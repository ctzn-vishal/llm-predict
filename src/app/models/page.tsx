import { ModelCard } from "@/components/model-card";
import { getLeaderboard } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const models = await getLeaderboard();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Models</h1>
        <p className="text-sm text-muted-foreground mt-1">
          6 frontier LLMs + 1 ensemble competing on prediction markets
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((m) => (
          <ModelCard key={m.model_id} model={m} />
        ))}
      </div>
    </div>
  );
}
