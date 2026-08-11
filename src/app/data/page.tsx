import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CategoryChart,
  CostPerScoredChart,
  HorizonChart,
  SpreadChart,
} from "@/components/data-article-charts";
import { getDataArticle, type DataArticle } from "@/lib/data-article";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Data — LLM Prediction Arena",
  description:
    "A tour of everything the arena has collected: what it costs to run, which topics defeat it, whether model disagreement predicts difficulty, and how much of the headline edge survives a confidence interval.",
};

async function fetchArticle(): Promise<DataArticle | null> {
  try {
    return await getDataArticle();
  } catch (error) {
    console.error("Error loading data article:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-mono text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {String(n).padStart(2, "0")}
        </p>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

const fmtDay = (s: string | null) => {
  if (!s) return "—";
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);

// ---------------------------------------------------------------------------
// Forest plot for the bootstrap intervals. Server-rendered SVG -- no
// interaction needed, and the geometry is the message: does the bar cross zero?
// ---------------------------------------------------------------------------
function IntervalPlot({
  rows,
  footer,
  posLabel = "beats the crowd →",
  negLabel = "← loses to the crowd",
  unit = "market-rounds",
}: {
  rows: { label: string; sub: string; diff: number; lo: number; hi: number; n: number; significant: boolean }[];
  footer: string;
  posLabel?: string;
  negLabel?: string;
  unit?: string;
}) {
  const span = Math.max(0.02, ...rows.flatMap((r) => [Math.abs(r.lo), Math.abs(r.hi)])) * 1.15;
  const X0 = 250;
  const X1 = 700;
  const zero = (X0 + X1) / 2;
  const x = (v: number) => zero + (v / span) * ((X1 - X0) / 2);
  const rowH = 64;
  const height = rows.length * rowH + 62;

  return (
    <svg viewBox={`0 0 760 ${height}`} className="h-auto w-full" role="img" aria-label="Bootstrap confidence intervals for each forecaster's edge over the crowd">
      {/* zero line */}
      <line x1={zero} y1="26" x2={zero} y2={rows.length * rowH + 24} className="stroke-border" strokeWidth="1.5" />
      <text x={zero} y="18" className="fill-muted-foreground" fontSize="10" textAnchor="middle">
        no difference
      </text>
      <text x={x(span * 0.55)} y="18" fill="#10A37F" fontSize="10" textAnchor="middle">
        {posLabel}
      </text>
      <text x={x(-span * 0.55)} y="18" fill="#F43F5E" fontSize="10" textAnchor="middle">
        {negLabel}
      </text>

      {rows.map((r, i) => {
        const y = 46 + i * rowH;
        const good = r.diff > 0;
        const color = r.significant ? (good ? "#10A37F" : "#F43F5E") : "#94A3B8";
        return (
          <g key={r.label}>
            <text x="8" y={y + 4} className="fill-foreground" fontSize="11">
              {r.label}
            </text>
            <text x="8" y={y + 17} className="fill-muted-foreground" fontSize="9">
              {r.sub}
            </text>
            <text x="8" y={y + 29} className="fill-muted-foreground" fontSize="9">
              {r.n.toLocaleString()} {unit} · {r.significant ? "excludes zero" : "crosses zero"}
            </text>
            {/* interval */}
            <line x1={x(r.lo)} y1={y} x2={x(r.hi)} y2={y} stroke={color} strokeWidth="2.5" />
            <line x1={x(r.lo)} y1={y - 6} x2={x(r.lo)} y2={y + 6} stroke={color} strokeWidth="2" />
            <line x1={x(r.hi)} y1={y - 6} x2={x(r.hi)} y2={y + 6} stroke={color} strokeWidth="2" />
            <circle cx={x(r.diff)} cy={y} r="5" fill={color} />
            <text x={X1 + 12} y={y + 4} fill={color} fontSize="10" fontFamily="monospace">
              {r.diff >= 0 ? "+" : ""}
              {r.diff.toFixed(4)}
            </text>
          </g>
        );
      })}
      <text x="8" y={rows.length * rowH + 52} className="fill-muted-foreground" fontSize="9">
        {footer}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------

export default async function DataPage() {
  const article = await fetchArticle();

  if (!article || article.corpus.nCases === 0) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">The Data</h1>
        <p className="text-sm text-muted-foreground">
          This article is computed live from settled forecasts, and there aren&apos;t enough yet.
          It fills in once markets from the first rounds resolve. In the meantime, the{" "}
          <Link href="/learn" className="text-primary hover:underline">
            tutorial
          </Link>{" "}
          explains what will appear here.
        </p>
      </div>
    );
  }

  const c = article.corpus;
  const worstCategory = article.byCategory[0];
  const bestEdge = [...article.byCategory].sort((a, b) => b.hybridEdge - a.hybridEdge)[0];
  const worstEdge = [...article.byCategory].sort((a, b) => a.hybridEdge - b.hybridEdge)[0];
  const tight = article.bySpread[0];
  const wide = article.bySpread[article.bySpread.length - 1];
  const leastReliable = [...article.ops].sort((a, b) => a.okRate - b.okRate)[0];
  const slowest = [...article.ops].sort((a, b) => b.p50LatencyMs - a.p50LatencyMs)[0];

  // The interval section reads very differently depending on which way the
  // evidence actually points, so the copy branches on the data rather than
  // assuming the flattering case.
  const sigWins = article.intervals.filter((i) => i.significant && i.diff > 0);
  const sigLosses = article.intervals.filter((i) => i.significant && i.diff < 0);
  const inconclusive = article.intervals.filter((i) => !i.significant);
  const bestRule = [...article.intervals].sort((a, b) => b.diff - a.diff)[0];
  const liveRow = article.intervals.find((i) => i.label.includes("live"));

  // "Typical bucket" for the category caveat -- the median, not the largest.
  const catSizes = article.byCategory.map((r) => r.n).sort((a, b) => a - b);
  const medianCatN = catSizes.length ? catSizes[Math.floor(catSizes.length / 2)] : 0;

  const ll = article.leadLag;
  const lk = article.leakage;

  return (
    <div className="space-y-10 pb-12">
      <header className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">
          The Data: {c.nForecasts.toLocaleString()} forecasts, and what they cost to collect
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The{" "}
          <Link href="/insights" className="text-primary hover:underline">
            Findings
          </Link>{" "}
          page argues about aggregation rules. This one is about the dataset underneath them —
          how it was produced, what it is made of, where it is thin, and how much of the headline
          result survives being asked politely for a confidence interval. Everything recomputes
          live from the same Turso database that serves the leaderboard. If you are new here,
          read the{" "}
          <Link href="/learn" className="text-primary hover:underline">
            tutorial
          </Link>{" "}
          first.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section n={1} title="What the arena has collected">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            value={c.nForecasts.toLocaleString()}
            label="forecast rows"
            sub={`${c.nModelForecasts.toLocaleString()} from live models`}
          />
          <Stat
            value={c.nCases.toLocaleString()}
            label="scored market-rounds"
            sub="3+ valid models and a price"
          />
          <Stat
            value={c.nMarkets.toLocaleString()}
            label="distinct markets"
            sub={`${c.nMarketsResolved.toLocaleString()} resolved`}
          />
          <Stat value={c.nRounds.toLocaleString()} label="rounds" sub={`${c.nCohorts} weekly cohorts`} />
          <Stat
            value={`$${c.totalCost.toFixed(2)}`}
            label="total API spend"
            sub="all models, all rounds"
          />
          <Stat
            value={`$${c.costPerMarketRound.toFixed(3)}`}
            label="per scored market-round"
            sub="six models + search"
          />
          <Stat
            value={`${Math.round(c.yesRate * 100)}%`}
            label="of scored markets resolved YES"
            sub="the base rate to beat"
          />
          <Stat
            value={`${c.nCategories}`}
            label="topic tags in the pool"
            sub={`${fmtDay(c.firstForecast)} → ${fmtDay(c.lastForecast)}`}
          />
        </div>
        <Prose>
          <p>
            Two of these numbers deserve attention before any chart. The first is{" "}
            <strong className="text-foreground">{c.nCases.toLocaleString()} scored
            market-rounds</strong> — not forecasts, market-rounds. Six models answering the same
            question are not six independent observations about forecasting skill; they are one
            question, answered six ways. Every comparison on this page uses the market-round as
            the unit, which is why the sample looks smaller here than the leaderboard&apos;s
            forecast counts suggest, and why it should.
          </p>
          <p>
            The second is <strong className="text-foreground">{Math.round(c.yesRate * 100)}% YES</strong>.
            That is the base rate of the sample, and it is the number a lazy forecaster would
            exploit. Any claim that a model &quot;knows something&quot; has to beat a constant
            forecast of {Math.round(c.yesRate * 100)}%, not a coin flip.
          </p>
        </Prose>
      </Section>

      <Separator />

      {/* ---------------------------------------------------------------- */}
      <Section n={2} title="Where the difficulty lives">
        <CategoryChart data={article.byCategory} />
        <Prose>
          <p>
            Forecast difficulty is not evenly spread across topics. The hardest slice for the
            market itself was{" "}
            <strong className="text-foreground">{worstCategory.category}</strong> (crowd Brier{" "}
            <span className="font-mono">{worstCategory.crowd.toFixed(4)}</span> over{" "}
            {worstCategory.n} market-rounds), and the models&apos; contribution varies just as
            much: the blend helped most on{" "}
            <strong className="text-foreground">{bestEdge.category}</strong> (
            {bestEdge.hybridEdge >= 0 ? "+" : ""}
            {bestEdge.hybridEdge.toFixed(4)} Brier vs. the price) and hurt most on{" "}
            <strong className="text-foreground">{worstEdge.category}</strong> (
            {worstEdge.hybridEdge >= 0 ? "+" : ""}
            {worstEdge.hybridEdge.toFixed(4)}).
          </p>
          <p>
            Resist reading a strategy into that. The typical bucket here holds about{" "}
            {medianCatN} market-rounds, so the gap between the best and worst topic is comfortably
            inside what chance produces — the honest use of this chart is to notice{" "}
            <em>heterogeneity</em>, not to pick a category to trade. Aggregate numbers on the
            other pages are averages over slices that behave quite differently, and that is worth
            knowing before you trust a single headline Brier.
          </p>
          <p>
            <span className="text-foreground">A caveat this chart exposes about the arena itself.</span>{" "}
            The row labels are Polymarket&apos;s own tags, and a single news cycle fragments across
            many of them — a Middle East escalation shows up separately as{" "}
            <em>middle east</em>, <em>iran</em>, <em>strait of hormuz</em>, <em>geopolitics</em>,
            and the names of individual figures. The round builder caps markets at three per
            category, but that cap compares tag <em>strings</em>, so eight differently-tagged
            markets about one week&apos;s events sail straight through it. The topic diversity in
            this dataset is therefore lower than the {c.nCategories} distinct tags suggest, and the
            effective sample size is correspondingly smaller than {c.nCases.toLocaleString()}.
          </p>
          <p>
            Categories with fewer than 8 scored market-rounds are pooled into a single{" "}
            &quot;other&quot; row rather than dropped, so the counts still sum to the full sample.
          </p>
        </Prose>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section n={3} title="Lead time">
        <HorizonChart data={article.byHorizon} />
        <Prose>
          <p>
            Intuition says a question resolving tomorrow should be easier than one resolving in a
            month, and mostly it is — but the arena&apos;s selection gate suppresses the effect on
            purpose. A market only enters a round while it is still trading between 5¢ and 95¢, so
            the near-dated questions that survive filtering are precisely the ones that stayed
            genuinely uncertain right up to the deadline. The easy short-horizon markets never
            appear in this chart because they were already priced at 97¢ when the round was built.
          </p>
        </Prose>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section n={4} title="Disagreement as a free uncertainty signal">
        <SpreadChart data={article.bySpread} />
        <Prose>
          {tight && wide && tight !== wide ? (
            <p>
              When the six models cluster within{" "}
              {(tight.avgSpread * 100).toFixed(1)} points of each other, the market&apos;s own
              Brier on those questions is{" "}
              <span className="font-mono">{tight.crowd.toFixed(4)}</span>. When they scatter by{" "}
              {(wide.avgSpread * 100).toFixed(1)} points, it is{" "}
              <span className="font-mono">{wide.crowd.toFixed(4)}</span>.{" "}
              {wide.crowd > tight.crowd
                ? "The models are detecting hard questions — and detecting them without ever seeing the price, which means the signal is genuinely independent of the market's own uncertainty."
                : "That is the wrong way round from the hypothesis: on this sample, model disagreement is not tracking the questions the market finds hard."}
            </p>
          ) : (
            <p>
              Not enough spread variation yet to say whether disagreement tracks difficulty.
            </p>
          )}
          <p>
            This one has a practical payoff that does not require the models to be good. A
            confidence signal that costs no extra API call — you already made the six calls — and
            correlates with difficulty is usable for triage: flag the wide-spread questions for a
            human, or for a more expensive model, and leave the tight ones alone.
          </p>
        </Prose>
      </Section>

      <Separator />

      {/* ---------------------------------------------------------------- */}
      <Section n={5} title="The machinery: reliability, latency, unit cost">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Per-model operating record</CardTitle>
            <CardDescription>
              Every call the arena has ever made, including the ones that failed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 text-right font-medium">Calls</th>
                    <th className="pb-2 text-right font-medium">Valid</th>
                    <th className="pb-2 text-right font-medium">Median</th>
                    <th className="pb-2 text-right font-medium">p90</th>
                    <th className="pb-2 text-right font-medium">Avg cost</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {article.ops.map((o) => (
                    <tr key={o.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 font-sans">
                        <span className="mr-2">{o.emoji}</span>
                        {o.name}
                      </td>
                      <td className="py-2 text-right">{o.nCalls.toLocaleString()}</td>
                      <td
                        className={`py-2 text-right ${
                          o.okRate >= 0.98
                            ? "text-emerald-400"
                            : o.okRate >= 0.9
                              ? "text-foreground"
                              : "text-red-400"
                        }`}
                      >
                        {(o.okRate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 text-right">{ms(o.p50LatencyMs)}</td>
                      <td className="py-2 text-right">{ms(o.p90LatencyMs)}</td>
                      <td className="py-2 text-right">${o.avgCost.toFixed(4)}</td>
                      <td className="py-2 text-right">${o.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CostPerScoredChart data={article.ops} />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Why calls fail</CardTitle>
              <CardDescription>
                Failure modes across every model call, collapsed into the categories that differ
                in how you would fix them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {article.failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No failed calls recorded. Every model call has returned a parseable forecast.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Failure mode</th>
                      <th className="pb-2 text-right font-medium">Count</th>
                      <th className="pb-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {article.failures.map((f) => (
                      <tr key={f.reason} className="border-b border-border/50 last:border-0">
                        <td className="py-2">{f.reason}</td>
                        <td className="py-2 text-right font-mono text-xs">{f.n}</td>
                        <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                          {(f.share * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                These rows are stored, not discarded. A failed forecast is excluded from scoring
                but still counted in the reliability column — so a model cannot buy a better Brier
                by refusing the hard questions.
              </p>
            </CardContent>
          </Card>
        </div>

        <Prose>
          <p>
            The unglamorous section, and the one most likely to be useful if you are building
            something similar. Three things stand out.{" "}
            {leastReliable && leastReliable.okRate < 0.99 && (
              <>
                <strong className="text-foreground">{leastReliable.name}</strong> is the least
                reliable of the roster at {(leastReliable.okRate * 100).toFixed(1)}% valid
                responses, which matters more than it looks: a model that fails 5% of the time is
                scored on a slightly different — and not randomly different — set of markets than
                its peers.{" "}
              </>
            )}
            {slowest && (
              <>
                <strong className="text-foreground">{slowest.name}</strong> has the longest median
                latency at {ms(slowest.p50LatencyMs)}, which is what sets the concurrency ceiling
                for the whole round.
              </>
            )}
          </p>
          <p>
            And the cost structure is the genuinely surprising part: inference is nearly free
            compared to retrieval. At roughly $0.005 per web search versus fractions of a cent for
            the tokens, the search plugin dominates the bill for every model on the roster. If you
            wanted to run this ten times cheaper, you would not switch models — you would batch or
            cache the search.
          </p>
        </Prose>
      </Section>

      <Separator />

      {/* ---------------------------------------------------------------- */}
      <Section n={6} title="How much of this survives a confidence interval?">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Brier advantage over the crowd, with 90% bootstrap intervals
            </CardTitle>
            <CardDescription>
              Paired over market-rounds — each forecaster is compared to the crowd on the same
              question, so the noise that cancels, cancels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IntervalPlot
              rows={article.intervals}
              footer={`90% intervals from ${article.bootstrapSamples.toLocaleString()} paired bootstrap resamples over market-rounds. Dot = observed mean advantage in Brier.`}
            />
          </CardContent>
        </Card>
        <Prose>
          <p>
            This is the section the rest of the site should be read through. A Brier difference of
            a few thousandths is easy to report and hard to believe, so here every headline gap is
            resampled {article.bootstrapSamples.toLocaleString()} times to ask what range of
            values is consistent with the data.
          </p>
          <p>
            An interval that clears zero is a real effect at this sample size; one that straddles
            zero is not yet distinguishable from luck. As of this page load,{" "}
            {sigWins.length > 0 && (
              <>
                <strong className="text-emerald-400">
                  {sigWins.length} of {article.intervals.length}
                </strong>{" "}
                beat the crowd by a margin the data can actually support
                {sigLosses.length > 0 || inconclusive.length > 0 ? ", " : ". "}
              </>
            )}
            {sigLosses.length > 0 && (
              <>
                <strong className="text-red-400">
                  {sigLosses.length} of {article.intervals.length}
                </strong>{" "}
                sit <em>below</em> zero with the whole interval on the losing side — measurably
                worse than simply quoting the market price
                {inconclusive.length > 0 ? ", " : ". "}
              </>
            )}
            {inconclusive.length > 0 && (
              <>
                and {inconclusive.length} cannot be separated from chance on{" "}
                {c.nCases.toLocaleString()} market-rounds.{" "}
              </>
            )}
            The least-bad of the four is{" "}
            <strong className="text-foreground">{bestRule.label}</strong> at{" "}
            <span className="font-mono">
              {bestRule.diff >= 0 ? "+" : ""}
              {bestRule.diff.toFixed(4)}
            </span>
            .
          </p>
          {sigLosses.length > 0 && (
            <p>
              That is worth stating plainly rather than burying: on the full settled record, these
              aggregation rules do not beat the market price. Anchoring hard on the price and
              nudging it 20% toward the model consensus gets closest — the blend loses by a small
              fraction of what the raw model pool loses, which is the same ordering the{" "}
              <Link href="/insights" className="text-primary hover:underline">
                Findings
              </Link>{" "}
              page describes. But &quot;closest to the market&quot; is not &quot;better than the
              market,&quot; and an interval that sits entirely below zero is the data declining to
              support the stronger claim.
            </p>
          )}
          {liveRow && (
            <p>
              The bottom row is the one that counts as evidence. The three above it replay a rule
              across the same history that was used to pick the 0.8 weight, so they are flattered
              by construction. The live row contains only forecasts made <em>after</em> the weight
              was fixed: {liveRow.n.toLocaleString()} market-rounds, an observed advantage of{" "}
              <span className="font-mono">
                {liveRow.diff >= 0 ? "+" : ""}
                {liveRow.diff.toFixed(4)}
              </span>
              , and an interval that {liveRow.significant ? "excludes" : "still straddles"} zero.
              {liveRow.significant
                ? " At this sample size that is a real effect, in whichever direction the sign points."
                : " Until that interval separates from zero, the honest summary is that the out-of-sample question is still open."}
            </p>
          )}
          <p>
            The pairing is what makes these intervals as tight as they are. Comparing two overall
            Brier scores would drown the signal in the variation between easy and hard markets;
            comparing per-market <em>differences</em> removes that variation entirely, because both
            forecasters faced the identical question.
          </p>
        </Prose>
      </Section>

      {ll && ll.rows.length >= 3 && (
        <>
          <Separator />
          <Section n={7} title="A result we had to throw away">
            <Prose>
              <p>
                Brier scores only grade a forecaster once the market resolves, which is slow and
                wastes most of the data. There is a sharper test borrowed from finance: instead of
                asking whether the model is <em>accurate</em>, ask whether it is <em>early</em>. If
                a model disagrees with the price today, does the price move toward the model
                tomorrow? A forecaster with genuine information should lead the market it is
                trading against, and this test yields an observation every round instead of one per
                resolution.
              </p>
              <p>
                Run naively, it works. Pooled across all {ll.nTransitions.toLocaleString()}{" "}
                round-to-round transitions, the model consensus predicts the direction of the next
                price move with a slope of{" "}
                <span className="font-mono">{ll.rows[0].diff.toFixed(4)}</span>, and the interval
                clears zero. That is a headline: <em>cheap LLMs anticipate prediction-market
                moves.</em>
              </p>
              <p>
                It is not true. It is a bug in this codebase, measured.
              </p>
            </Prose>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  The same test, split by whether our stored price was stale
                </CardTitle>
                <CardDescription>
                  OLS slope of (next price move) on (model consensus − price), with 95% intervals
                  from a block bootstrap that resamples whole markets.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IntervalPlot
                  rows={ll.rows}
                  posLabel="model leads →"
                  negLabel="← model lags"
                  unit="transitions"
                  footer={`Block bootstrap, ${ll.bootstrapSamples.toLocaleString()} resamples over markets. Dot = OLS slope.`}
                />
              </CardContent>
            </Card>

            <Prose>
              <p>
                The arena refreshes market prices by re-syncing Polymarket&apos;s top markets by
                volume before each round. A market that is still being forecast but has dropped out
                of that top slice keeps whatever price it was last given — so{" "}
                <strong className="text-foreground">
                  {Math.round(ll.stalePct * 100)}% of round-to-round transitions show no price
                  change at all
                </strong>
                , not because the market was quiet but because nobody asked it.
              </p>
              <p>
                When that stale snapshot eventually refreshes, it jumps to catch up with reality. A
                model that just ran a live web search &quot;predicts&quot; that jump for free — it
                is not forecasting the market, it is forecasting our own cache. Splitting the sample
                on that single distinction separates the two stories cleanly:{" "}
                <span className="font-mono">{ll.rows[1].diff.toFixed(4)}</span> when the price was
                stale ({ll.rows[1].significant ? "interval clears zero" : "not significant"}), and{" "}
                <span className="font-mono">{ll.rows[2].diff.toFixed(4)}</span> when it was fresh (
                {ll.rows[2].significant ? "interval clears zero" : "indistinguishable from zero"}).
                {!ll.rows[2].significant &&
                  " All of the apparent edge lives in the stale rows. Against a market price we actually observed moving, the models lead by nothing."}
              </p>
              {ll.truth && (
                <>
                <p>
                  The same conclusion arrives from a direction that does not depend on price
                  refresh at all. Regressing the eventual outcome on the model&apos;s disagreement
                  with the price gives a slope of{" "}
                  <span className="font-mono">{ll.truth.diff.toFixed(4)}</span> (95% CI{" "}
                  <span className="font-mono">
                    [{ll.truth.lo.toFixed(3)}, {ll.truth.hi.toFixed(3)}]
                  </span>
                  , {ll.truth.nMarkets} markets). If disagreement carried information about the
                  truth, that slope would be positive, and it would tell you how far to move from
                  the price toward the models — in other words, the optimal blend weight.{" "}
                  {ll.truth.significant
                    ? `It is reliably ${ll.truth.diff < 0 ? "negative" : "positive"}.`
                    : `The point estimate is ${ll.truth.diff < 0 ? "negative" : "positive"}, but the interval straddles zero, so the honest reading is "no detectable information" rather than "negative information."`}{" "}
                  Either way it gives no support to a positive weight on the models, which is the
                  same verdict the confidence intervals above deliver — reached without using a
                  single Brier score.
                </p>
                <p className="text-xs">
                  Note the sample here: {ll.truth.n.toLocaleString()} observations, but only{" "}
                  {ll.truth.nMarkets} markets, and observations inside one market share an outcome.
                  The bootstrap resamples whole markets for exactly that reason, which is why the
                  interval is as wide as it is. The effective sample size is the market count, not
                  the row count.
                </p>
                </>
              )}
              <p>
                <span className="text-foreground">Why this section exists.</span> The result is
                null, so it wins no argument and appears on no leaderboard. But the near-miss is the
                most useful thing in this article: a plausible test, a clean significant result, a
                satisfying story — and an artifact of our own infrastructure. The only reason it was
                caught is that the confound suggested an obvious falsification test, and the test
                was run before the headline was written.
              </p>
              <p>
                <span className="text-foreground">It also flags a live defect.</span> If{" "}
                {Math.round(ll.stalePct * 100)}% of forecasts are scored against a price that is at
                least a round old, then &quot;the crowd&quot; on the leaderboard is not quite the
                market&apos;s current opinion — it is a slightly delayed one, and a delayed price is
                a weaker forecaster than a live one. That handicaps the baseline the models are
                already losing to, which means the models&apos; deficit is, if anything,
                understated.
              </p>
            </Prose>
          </Section>
        </>
      )}

      {lk && (
        <>
          <Separator />
          <Section n={8} title="The blind forecasts are not entirely blind">
            <Prose>
              <p>
                Every claim on this site rests on one assumption: the six models never see the
                market price, so their forecasts are independent of it. The prompt does withhold
                the price. But the models also run a live web search, and Exa indexes Polymarket,
                Kalshi, and every site that quotes them. A model can simply read the number it was
                never told.
              </p>
              <p>
                It happens constantly.{" "}
                <strong className="text-foreground">
                  {Math.round(lk.leakPct * 100)}% of valid blind forecasts
                </strong>{" "}
                ({lk.nLeaked.toLocaleString()} of {lk.nForecasts.toLocaleString()}) name a
                prediction venue or cite market-implied odds in their own stated reasoning. The
                detector is deliberately narrow — it matches &quot;Polymarket&quot;,
                &quot;implied probability&quot;, &quot;betting odds&quot; and similar, but not
                &quot;stock market&quot; or &quot;market cap&quot; — so this is a floor, not an
                estimate.
              </p>
            </Prose>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">How often each model does it</CardTitle>
                  <CardDescription>
                    Share of that model&apos;s valid blind forecasts citing market odds.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {lk.perModel.map((m) => (
                        <tr key={m.id} className="border-b border-border/50 last:border-0">
                          <td className="py-2">
                            <span className="mr-2">{m.emoji}</span>
                            {m.name}
                          </td>
                          <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                            {m.leak.toLocaleString()}/{m.n.toLocaleString()}
                          </td>
                          <td className="w-28 py-2 pl-3">
                            <div className="h-2 w-full rounded bg-muted">
                              <div
                                className="h-2 rounded"
                                style={{ width: `${m.pct * 100}%`, background: m.color }}
                              />
                            </div>
                          </td>
                          <td className="py-2 pl-2 text-right font-mono text-xs">
                            {(m.pct * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Does it pull the forecast toward the price?
                  </CardTitle>
                  <CardDescription>
                    Within-market test: same market, same round, same price — leaky forecasts
                    versus clean ones.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p className="font-mono text-foreground">
                    {lk.withinDiff >= 0 ? "+" : ""}
                    {(lk.withinDiff * 100).toFixed(2)} pts
                    <span className="ml-2 text-xs text-muted-foreground">
                      95% CI [{(lk.withinLo * 100).toFixed(2)}, {(lk.withinHi * 100).toFixed(2)}]
                    </span>
                  </p>
                  <p className="text-xs">
                    Across {lk.withinGroups.toLocaleString()} market-rounds ({lk.withinMarkets}{" "}
                    markets) that contained both a leaky and a clean forecast.{" "}
                    {lk.withinSignificant && lk.withinDiff < 0
                      ? "Negative and clear of zero: citing the market moves a forecast measurably closer to the price, holding the question fixed."
                      : lk.withinSignificant
                        ? "Clear of zero, in the opposite direction to the leakage hypothesis."
                        : "Not distinguishable from zero at this sample size."}
                  </p>
                  <div className="border-t border-border pt-3">
                    <p className="text-xs">
                      Forecasts landing within half a point of the price:{" "}
                      <span className="font-mono text-foreground">
                        {(lk.copyPct * 100).toFixed(1)}%
                      </span>{" "}
                      versus{" "}
                      <span className="font-mono">{(lk.copyBaselinePct * 100).toFixed(1)}%</span>{" "}
                      expected by chance (prices shuffled across unrelated markets) — a{" "}
                      {(lk.copyPct / Math.max(lk.copyBaselinePct, 1e-9)).toFixed(1)}× enrichment.
                      Some of these are verbatim: the reasoning quotes an implied probability and
                      the forecast is that number.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {lk.strata.length >= 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Leakage was flattering the models, not fooling us
                  </CardTitle>
                  <CardDescription>
                    The same ensemble-vs-crowd comparison, split by how much of the round&apos;s
                    forecasting cited a market.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="pb-2 font-medium">Market-rounds where…</th>
                          <th className="pb-2 text-right font-medium">n</th>
                          <th className="pb-2 text-right font-medium">Ensemble</th>
                          <th className="pb-2 text-right font-medium">Crowd</th>
                          <th className="pb-2 text-right font-medium">Skill</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono text-xs">
                        {lk.strata.map((s) => (
                          <tr key={s.label} className="border-b border-border/50 last:border-0">
                            <td className="py-2 font-sans">{s.label}</td>
                            <td className="py-2 text-right">{s.n}</td>
                            <td className="py-2 text-right">{s.ensemble.toFixed(4)}</td>
                            <td className="py-2 text-right">{s.crowd.toFixed(4)}</td>
                            <td
                              className={`py-2 text-right ${
                                s.skill >= 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {s.skill >= 0 ? "+" : ""}
                              {s.skill.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Prose>
              <p>
                That table is the part worth sitting with. The intuitive worry is that leakage
                inflates the models — that they look competitive only because they are copying. The
                data says the effect is real and{" "}
                <strong className="text-foreground">larger than the headline suggests</strong>: on
                rounds where no model cited a market, the ensemble loses to the crowd by{" "}
                <span className="font-mono">{lk.strata[0]?.skill.toFixed(4)}</span>, against{" "}
                <span className="font-mono">
                  {lk.strata[lk.strata.length - 1]?.skill.toFixed(4)}
                </span>{" "}
                where every model cited one. The pooled number reported everywhere else on this
                site sits between those, because most rounds are mixed.
              </p>
              <p>
                One honest confound: the no-leakage rounds are harder for everyone — the crowd&apos;s
                own Brier is worse there too, because a market nobody writes about is a market
                nobody has analysed. But the models degrade far more steeply than the crowd does
                across those strata, which is what you would expect if part of their apparent
                accuracy had been borrowed rather than earned.
              </p>
              <p>
                <span className="text-foreground">What this does and does not overturn.</span> It
                does not rescue the models — the direction of every finding on this site survives,
                and the honest version of &quot;cheap LLMs lose to the market&quot; is worse than
                the number we have been reporting. What it does undermine is the word{" "}
                <em>independent</em>. The ensemble argument on{" "}
                <Link href="/analysis" className="text-primary hover:underline">
                  The Lesson
                </Link>{" "}
                assumes six forecasts that err in unrelated ways; forecasts partly anchored to a
                shared price are correlated by construction, and averaging cannot diversify away an
                error they all inherited from the same source.
              </p>
              <p>
                <span className="text-foreground">The fix is not obvious.</span> Removing web search
                would make the models genuinely blind and much worse, and would stop testing
                anything interesting. Excluding prediction-market domains from the search plugin is
                the narrow repair, and it is the one worth trying — but it changes the
                data-generating process, so it splits the dataset in two and every comparison across
                the boundary becomes suspect. That is a decision about the experiment, not a bug fix.
              </p>
            </Prose>
          </Section>
        </>
      )}

      <Card className="border-dashed">
        <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Caveats that apply to every chart above.</span>{" "}
            This is one platform, one market-selection rule, one roster of cheap models, and one
            stretch of news. Categories are Polymarket&apos;s own tags, so the slicing inherits
            whatever inconsistency those tags have. And the blend weight used by the hybrid was
            chosen on earlier data — the{" "}
            <Link href="/insights" className="text-primary hover:underline">
              Findings
            </Link>{" "}
            page separates that backtest from the live out-of-sample record, and only the latter is
            evidence.
          </p>
          <p>
            Methods for every number are in{" "}
            <Link href="/methodology" className="text-primary hover:underline">
              methodology
            </Link>
            ; the reasoning behind the design is in the{" "}
            <Link href="/learn" className="text-primary hover:underline">
              tutorial
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
