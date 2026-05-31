import { Card, CardContent } from "@/components/ui/card";
import { EnsembleComparisonChart } from "@/components/ensemble-comparison-chart";
import { EnsembleSizeChart } from "@/components/ensemble-size-chart";
import { CorrelationHeatmap } from "@/components/correlation-heatmap";
import {
  getEnsembleComparison,
  getEnsembleSizeCurve,
  getErrorCorrelationMatrix,
} from "@/lib/scoring";
import { fmtSkill } from "@/lib/format";
import type {
  EnsembleComparison,
  EnsembleSizePoint,
  CorrelationCell,
} from "@/lib/schemas";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Lesson — LLM Prediction Arena",
  description:
    "Why pooling many LLM forecasts into an ensemble beats the average model — and how it stacks up against the crowd.",
};

const EMPTY_COMPARISON: EnsembleComparison = {
  ensembleBrier: 0,
  meanIndividualBrier: 0,
  bestIndividualBrier: 0,
  bestIndividualId: "",
  crowdBrier: 0,
  nMarkets: 0,
};

async function fetchAnalysis(): Promise<{
  comparison: EnsembleComparison;
  sizeCurve: EnsembleSizePoint[];
  correlation: CorrelationCell[];
}> {
  try {
    const [comparison, sizeCurve, correlation] = await Promise.all([
      getEnsembleComparison(),
      getEnsembleSizeCurve(),
      getErrorCorrelationMatrix(),
    ]);
    return { comparison, sizeCurve, correlation };
  } catch (error) {
    console.error("Error loading analysis page:", error);
    return { comparison: EMPTY_COMPARISON, sizeCurve: [], correlation: [] };
  }
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-mono text-lg font-semibold ${good ? "text-emerald-400" : "text-red-400"}`}>
        {value}
      </p>
    </div>
  );
}

export default async function AnalysisPage() {
  const { comparison, sizeCurve, correlation } = await fetchAnalysis();
  const hasData = comparison.nMarkets > 0;

  const vsAvg = comparison.meanIndividualBrier - comparison.ensembleBrier;
  const vsBest = comparison.bestIndividualBrier - comparison.ensembleBrier;
  const vsCrowd = comparison.crowdBrier - comparison.ensembleBrier;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">The Lesson: why pool many models?</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A single model is noisy — it has blind spots and overconfident moments. The bet behind
          this arena is that <span className="text-foreground">averaging</span> several
          independent LLM forecasts cancels out their individual errors, producing a sharper,
          better-calibrated probability than any one of them alone. Three questions test that
          claim.
        </p>
      </div>

      {hasData && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Ensemble vs. avg model" value={fmtSkill(vsAvg)} good={vsAvg >= 0} />
          <Stat label="Ensemble vs. best model" value={fmtSkill(vsBest)} good={vsBest >= 0} />
          <Stat label="Ensemble vs. crowd" value={fmtSkill(vsCrowd)} good={vsCrowd >= 0} />
        </div>
      )}

      {/* 1. Does pooling help at all? */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">1. Does the ensemble beat its parts?</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            If pooling works, the ensemble&apos;s Brier score should sit below the average single
            model. Beating the <em>best</em> single model is a higher bar — and beating the crowd
            (the market price) is the highest bar of all.
          </p>
        </div>
        <EnsembleComparisonChart comparison={comparison} />
      </section>

      {/* 2. Marginal value of more models */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">2. How many models do you need?</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Each extra model adds value only if it brings something the others miss. We average the
            Brier score over every possible k-model subset, so the curve shows the typical benefit
            of growing the ensemble. A curve that flattens early means a handful of models captures
            most of the gain.
          </p>
        </div>
        <EnsembleSizeChart data={sizeCurve} />
      </section>

      {/* 3. Why it works */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">3. Why it works: independent mistakes</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Averaging only helps when models err in <em>different</em> directions. If every model
            made the same mistake on the same market, the ensemble would inherit it. The heatmap
            below shows how correlated each pair&apos;s forecast errors are — the greener and more
            independent, the more an ensemble can diversify them away.
          </p>
        </div>
        <CorrelationHeatmap data={correlation} />
      </section>

      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">The takeaway.</span> Prediction markets
            aggregate many human (and bot) opinions into one price — a crowd. This arena asks
            whether a crowd of <em>language models</em> can do the same job, and whether their
            blind, independent forecasts pooled together rival the market that has money on the
            line. See the{" "}
            <a href="/methodology" className="text-primary hover:underline">
              methodology
            </a>{" "}
            for exactly how each number is computed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
