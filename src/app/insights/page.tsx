import { Card, CardContent } from "@/components/ui/card";
import {
  BiasChart,
  DivergenceChart,
  ReliabilityChart,
  StrategyChart,
  SweepChart,
} from "@/components/insights-charts";
import { getInsights, type Insights } from "@/lib/insights";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Findings — LLM Prediction Arena",
  description:
    "What thousands of settled blind forecasts reveal: a shared skepticism bias, why extremizing backfires, and how cheap LLMs add information to the market price.",
};

async function fetchInsights(): Promise<Insights | null> {
  try {
    return await getInsights();
  } catch (error) {
    console.error("Error loading insights page:", error);
    return null;
  }
}

function Headline({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className={`font-mono text-lg font-semibold ${accent ? "text-rose-400" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function InsightsPage() {
  const insights = await fetchInsights();

  if (!insights || insights.nCases === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Findings</h1>
        <p className="text-sm text-muted-foreground">
          No settled forecasts yet — findings appear once markets resolve.
        </p>
      </div>
    );
  }

  const i = insights;
  const edge = i.crowdBrier - i.hybridBacktestBrier;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Findings: what {i.nSettledForecasts.toLocaleString()} settled forecasts taught us
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Every conclusion below is recomputed live from the arena&apos;s own database — the
          same stored forecasts, the same market prices captured at forecast time, the same
          resolved outcomes. Nothing is hand-tuned; reload after the next settlement and the
          numbers update.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Headline
          value={i.hybridBacktestBrier.toFixed(4)}
          label="Brier of 80% market + 20% models (backtest)"
          accent
        />
        <Headline value={i.crowdBrier.toFixed(4)} label="Brier of the market price alone" />
        <Headline
          value={`${edge > 0 ? "" : "+"}${((-edge / i.crowdBrier) * 100).toFixed(1).replace("-", "−")}%`}
          label={
            edge > 0
              ? "Brier reduction from adding six cheap LLMs to the market"
              : "Current gap to the market (models not adding value)"
          }
          accent={edge > 0}
        />
      </div>

      {/* Finding 1 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">1. Cheap LLMs share a skepticism bias</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            All six models — from four countries and five companies — systematically
            under-predict YES. Events they collectively priced in the teens resolved YES
            roughly a third of the time. This is not one model&apos;s quirk; it is a shared
            prior, which means averaging more models does <em>not</em> wash it out.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <BiasChart data={i.bias} />
          <ReliabilityChart data={i.reliability} />
        </div>
      </section>

      {/* Finding 2 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            2. The superforecasting playbook backfires on LLMs
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            With human forecasting teams, the classic move is to <em>extremize</em> the
            pooled forecast — push it away from 0.5, because averaging washes out
            legitimate confidence. LLMs are the opposite: already overconfident, so
            extremizing makes them strictly worse and shrinking toward 0.5 helps. Received
            wisdom from human crowds does not transfer unchanged to silicon ones.
          </p>
        </div>
        <StrategyChart data={i.strategies} n={i.nCases} />
      </section>

      {/* Finding 3 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            3. Models can&apos;t beat the market — but they can improve it
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Head-to-head, the market price wins: when the model consensus diverges from the
            price, the market is right about 70% of the time. But &quot;usually wrong&quot;
            still carries signal. Blending roughly 20% of the model consensus into the
            market price (in log-odds space) produced a better Brier score than the market
            alone — the <span className="text-rose-400">Market × Models</span> forecaster
            on the leaderboard runs exactly this rule, live, as an out-of-sample test.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SweepChart data={i.sweep} crowdBrier={i.crowdBrier} />
          <DivergenceChart data={i.divergence} />
        </div>
        {i.liveHybridN > 0 && i.liveHybridBrier != null && (
          <Card>
            <CardContent className="p-5 text-sm">
              <p className="font-medium">Live out-of-sample scorecard</p>
              <p className="mt-1 text-muted-foreground">
                Since going live, Market × Models has settled {i.liveHybridN} forecasts with
                a Brier of{" "}
                <span className="font-mono text-foreground">
                  {i.liveHybridBrier.toFixed(4)}
                </span>
                {i.liveCrowdBrierShared != null && (
                  <>
                    {" "}
                    vs the market&apos;s{" "}
                    <span className="font-mono text-foreground">
                      {i.liveCrowdBrierShared.toFixed(4)}
                    </span>{" "}
                    on the same markets
                  </>
                )}
                . {i.liveHybridBrier < (i.liveCrowdBrierShared ?? Infinity)
                  ? "So far the backtest edge is holding."
                  : "The backtest edge has not shown up yet — which is itself the honest result."}
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Finding 4 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">4. What we tried and rejected</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The obvious fix for a systematic bias is to learn a correction from history
            (Platt recalibration: fit a line through past logit-forecasts vs outcomes,
            apply it to new ones). In-sample it looks great. Fit on the earlier half of the
            data and tested on the later half, it made forecasts <em>worse</em> — the bias
            isn&apos;t stable across news regimes, so yesterday&apos;s correction
            over-corrects today. That is why the leaderboard carries no
            &quot;calibrated&quot; forecaster: it failed the honest test.
          </p>
        </div>
        <Card>
          <CardContent className="p-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 text-right font-medium">Market-rounds</th>
                  <th className="pb-2 text-right font-medium">Market Brier</th>
                  <th className="pb-2 text-right font-medium">Model pool</th>
                  <th className="pb-2 text-right font-medium">Market × Models</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {i.regimes.map((r) => (
                  <tr key={r.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-sans">{r.label}</td>
                    <td className="py-2 text-right">{r.n}</td>
                    <td className="py-2 text-right">{r.crowd.toFixed(4)}</td>
                    <td className="py-2 text-right">{r.pool.toFixed(4)}</td>
                    <td className="py-2 text-right">{r.hybrid.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Forecast difficulty swings hard between news regimes (compare the market
              columns), but the blend&apos;s edge over the market is the more stable
              pattern — which is why it, and not a learned bias correction, went live.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Why this matters.</span> A
            prediction market is already an aggregation machine — money turns opinions into
            a price. The interesting question was never &quot;can a $0.001 LLM call out-trade
            Polymarket?&quot; (it can&apos;t), but &quot;does it know anything the market
            hasn&apos;t priced?&quot; The data says: a little, reliably enough to measure.
            The <a href="/" className="text-primary hover:underline">leaderboard</a> now
            tracks that claim in real time, and the{" "}
            <a href="/methodology" className="text-primary hover:underline">methodology</a>{" "}
            page explains every metric.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
