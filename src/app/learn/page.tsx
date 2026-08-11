import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BrierDiagram,
  CalibrationDiagram,
  EnsembleDiagram,
  InformationSetDiagram,
  LogitDiagram,
  PipelineDiagram,
  TrainingCutoffDiagram,
} from "@/components/tutorial-diagrams";

export const metadata = {
  title: "Tutorial — LLM Prediction Arena",
  description:
    "A student's walkthrough of how the arena works: why prediction markets, how a blind forecast is made, what a Brier score really measures, and why the ensemble is the whole point.",
};

// ---------------------------------------------------------------------------
// Small presentational helpers, local to the tutorial.
// ---------------------------------------------------------------------------

function Section({
  n,
  title,
  question,
  children,
}: {
  n: number;
  title: string;
  question: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`s${n}`} className="scroll-mt-6 space-y-3">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Part {n}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm italic text-muted-foreground">{question}</p>
      </div>
      <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/** Pointer into the actual source, so a curious student can go read it. */
function InCode({ items }: { items: { file: string; what: string }[] }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
      <p className="text-xs font-medium text-foreground">Where this lives in the code</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((i) => (
          <li key={i.file} className="text-xs">
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              {i.file}
            </code>{" "}
            <span className="text-muted-foreground">— {i.what}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Aside({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border-l-2 border-primary/60 bg-muted/20 py-3 pl-4 pr-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</p>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

function Check({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-md border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:content-none">
        <span className="mr-2 text-primary">?</span>
        {q}
        <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">
          — click to reveal
        </span>
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
    </details>
  );
}

const CONTENTS = [
  "The problem with benchmarks",
  "The pipeline, end to end",
  "What each forecaster is allowed to see",
  "But the models' training data is old",
  "Scoring: what a Brier score actually measures",
  "Calibration vs. being right",
  "Why the ensemble is the real experiment",
  "Log-odds, and why the blend lives there",
  "How to read the results honestly",
];

export default function LearnPage() {
  return (
    <div className="space-y-10 pb-12">
      <header className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight">
          How this arena works — a walkthrough
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This page is the guided tour. It assumes no background in forecasting, statistics, or
          machine learning, and builds up to the point where the{" "}
          <Link href="/insights" className="text-primary hover:underline">
            Findings
          </Link>{" "}
          and{" "}
          <Link href="/data" className="text-primary hover:underline">
            Data
          </Link>{" "}
          pages read as arguments rather than dashboards. If you only want the formulas, the{" "}
          <Link href="/methodology" className="text-primary hover:underline">
            methodology
          </Link>{" "}
          page is the terse version.
        </p>
      </header>

      <Card>
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Contents
          </p>
          <ol className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {CONTENTS.map((c, i) => (
              <li key={c}>
                <a href={`#s${i + 1}`} className="text-muted-foreground hover:text-primary">
                  <span className="mr-2 font-mono text-xs text-muted-foreground/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {c}
                </a>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={1}
        title="The problem with benchmarks"
        question="Why measure a language model against a betting market instead of a test set?"
      >
        <p>
          Almost every well-known way of scoring a language model is a fixed set of questions with
          fixed answers — MMLU, HumanEval, GSM8K. They share a structural weakness: once a
          benchmark exists on the public internet, it eventually gets scraped into the next
          model&apos;s training data. After that, a high score is ambiguous. Did the model reason
          its way there, or did it remember the answer key? You cannot tell from the score alone,
          and the ambiguity gets worse every year.
        </p>
        <p>
          A question about next month has no answer key. Nobody knows whether a ceasefire will hold
          or a bill will pass, so there is nothing to memorize. To do well, a forecaster has to
          actually combine what it knows about how the world usually works with what it can find
          out about this particular situation — and then commit to a number.
        </p>
        <p>
          Prediction markets give us those questions with two useful properties attached. They
          resolve unambiguously against a public rule, and they come with a{" "}
          <strong className="text-foreground">price</strong>, which is itself a forecast made by
          people with money at stake. That price is our benchmark: not a leaderboard of models
          against each other, but a standing bet against the crowd.
        </p>
        <Aside title="A note on what &quot;beating the market&quot; would mean">
          <p>
            It would be a surprising result, and you should be suspicious of anyone who claims it
            casually. Polymarket prices are set by people who lose real money when they are wrong.
            The honest question this project asks is narrower and much more interesting: does a
            $0.001 language model call know <em>anything</em> the price has not already absorbed —
            even a little, even if the model on its own is worse?
          </p>
        </Aside>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={2}
        title="The pipeline, end to end"
        question="What actually happens between a Polymarket question and a number on the leaderboard?"
      >
        <p>
          Twice a day a scheduled job picks twelve markets and asks every forecaster for a
          probability. Most of the engineering is in the filtering: which markets are worth asking
          about at all.
        </p>
        <PipelineDiagram />
        <p>
          The selection gate is doing real work. Sports and daily-weather markets are excluded
          on purpose — not because they are uninteresting, but because a same-day game resolves in
          hours and a web search just fetches the score. That is lookup, not forecasting. The
          horizon window (one to forty-five days) is the same idea from both ends: at least a day
          out so the outcome is genuinely undetermined, and inside six weeks so the
          forecast-to-score feedback loop actually closes while the project is running.
        </p>
        <p>
          The price filter matters too. A market trading at 97¢ tells you almost nothing about a
          forecaster — everyone says 97%, everyone scores well, and the comparison is noise. Keeping
          to the 5¢–95¢ band means every market in the sample still has something to be right or
          wrong about.
        </p>
        <InCode
          items={[
            { file: "src/lib/polymarket.ts", what: "the tag exclusions and the selection gate" },
            { file: "src/lib/prediction.ts", what: "round assembly, concurrency, budget cap" },
            { file: "src/lib/openrouter.ts", what: "the prompt and the per-model API call" },
            { file: "src/lib/settlement.ts", what: "resolution checking and scoring" },
          ]}
        />
        <Check
          q="Why cap the round at three markets per category?"
          a="Because a single hot news cycle can spawn a dozen related markets, and forecasts on related markets are not independent observations. If ten of twelve markets in a round are about the same election, the round measures one correlated bet rather than twelve. That would inflate any apparent skill (or lack of it) and quietly break the sample-size arithmetic on every downstream chart."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={3}
        title="What each forecaster is allowed to see"
        question="Why go to the trouble of hiding the market price from the models?"
      >
        <p>
          Nine rows get written for every market: six model forecasts, plus three computed ones.
          The design decision that everything else depends on is which of them can see the price.
        </p>
        <InformationSetDiagram />
        <p>
          If a model could see that a market trades at 62¢, the cheapest way to get a good score
          would be to answer &quot;62%&quot; and stop thinking. It would look well-calibrated. The
          ensemble of six such models would look well-calibrated too — and would have measured
          nothing except the models&apos; ability to read a number off a page. Blinding them is what
          makes the six forecasts <strong className="text-foreground">independent</strong> of the
          crowd, and independence is the precondition for the entire ensemble argument in Part 7.
        </p>
        <p>
          The three computed forecasters are not models and cost nothing to run:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-foreground">Ensemble</strong> — the plain average of whichever
            model forecasts came back valid. No weighting, no tuning.
          </li>
          <li>
            <strong className="text-rose-400">Market × Models (hybrid)</strong> — the one forecaster
            that <em>does</em> see the price. It starts from the price and nudges it 20% of the way
            toward the model consensus. This is the live test of &quot;do the models add anything?&quot;
          </li>
          <li>
            <strong className="text-slate-300">The Crowd</strong> — the price itself, scored exactly
            like any other forecaster. This is the bar.
          </li>
        </ul>
        <Aside title="Failures are data, not noise to be cleaned">
          <p>
            When a model times out, returns malformed JSON, or errors, the row is written with{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs">ok = 0</code> and the reason,
            and it is excluded from scoring. It is never quietly replaced with 0.5. A default value
            would flatter unreliable models by handing them a free coin-flip forecast on every
            question they failed — and 0.5 happens to be a decent score, which is exactly what makes
            the shortcut so tempting and so wrong.
          </p>
        </Aside>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={4}
        title="But the models' training data is old"
        question="A model frozen in the past is being asked about next month. How is that not nonsense?"
      >
        <p>
          This is the first objection almost everyone raises, and it is a good one. The answer has
          two halves, and keeping them separate is most of the insight.
        </p>
        <TrainingCutoffDiagram />
        <p>
          <strong className="text-foreground">Pretraining supplies the prior.</strong> A model that
          learned nothing after its cutoff still knows how the world tends to behave: how often
          announced mergers actually close, how central banks respond to inflation prints, how long
          a coalition government survives a scandal, how frequently a ceasefire announced in week
          one is still holding in week four. That is base-rate knowledge, and it does not go stale
          the way facts do. The system prompt asks for it explicitly — &quot;think in terms of base
          rates, then adjust for specific evidence.&quot;
        </p>
        <p>
          <strong className="text-foreground">Retrieval supplies the current state.</strong> Every
          call runs a web search first and the results land in the context window before the model
          answers. The weights are frozen; the context is not. So the model is not remembering the
          answer, it is reading today&apos;s news and applying an old, still-valid sense of how such
          stories usually end.
        </p>
        <p>
          Where this genuinely breaks down is worth naming, because it is a real limitation and not
          a hypothetical one. With only four search results, a model can carry a stale premise —
          who holds an office, whether a company still exists independently — straight into its
          forecast, and nothing in the response will flag that it did. And if search silently
          returns nothing, the model answers from memory alone without saying so.
        </p>
        <Aside title="This happened here, and it is why the code looks the way it does">
          <p>
            One provider&apos;s native search integration returned zero results on a specific model
            while still reporting success. Those forecasts were being made blind from training data
            and looked identical to well-grounded ones. The fix was to force the same Exa search
            engine for every model, which also equalizes cost and means the six forecasters differ
            only in reasoning — not in the quality of their search backend.
          </p>
        </Aside>
        <Check
          q="If search does the heavy lifting, are we really testing the models at all?"
          a="Yes — but we are testing judgment, not recall. Every model gets the same four search results and the same question, so the differences on the leaderboard come entirely from what each one does with that identical evidence: which factors it weighs, how far it moves from its prior, and how confident it is willing to be. That is precisely the skill a forecaster is supposed to have, and it is the one thing a memorized answer key cannot supply."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={5}
        title="Scoring: what a Brier score actually measures"
        question="How do you grade a probability when the event only happens once?"
      >
        <p>
          You cannot grade a single probability. &quot;30% chance of rain&quot; is not wrong when it
          rains. But you can grade a <em>collection</em> of probabilities, and the tool for it is
          embarrassingly simple: take the distance between what you said and what happened, and
          square it.
        </p>
        <BrierDiagram />
        <p>
          Squaring is the whole trick. It makes the rule{" "}
          <strong className="text-foreground">proper</strong> — a piece of jargon with a concrete
          meaning: your expected score is best when you report your honest belief. There is no way
          to game a Brier score by shading your answers. If you truly think something is 70% likely,
          saying 85% to look decisive raises your expected penalty. Saying 55% to play it safe does
          too.
        </p>
        <p>
          Two reference points make the numbers legible. A forecaster that always says 50% scores
          0.25 — that is the &quot;knows nothing&quot; line. A perfect oracle scores 0. Real
          forecasters on genuinely uncertain questions land somewhere in between, and the
          differences that matter are small: a gap of 0.01 between two forecasters is a meaningful
          edge, not a rounding error.
        </p>
        <p>
          The arena also tracks <strong className="text-foreground">log loss</strong>, which is the
          same idea with a harsher temperament. It punishes confident mistakes far more severely —
          being certain and wrong costs infinitely much, which is why probabilities are clamped away
          from exactly 0 and 1 before scoring. And the headline number on the leaderboard is neither
          of these but a difference:{" "}
          <strong className="text-foreground">skill vs. crowd</strong> = the crowd&apos;s Brier minus
          yours, on the same markets. Positive means you beat the market. Comparing on the identical
          resolved set is what makes it a fair fight; a forecaster that skipped the hard questions
          would otherwise look brilliant.
        </p>
        <InCode
          items={[
            { file: "src/lib/scoring.ts", what: "Brier decomposition, ECE, skill vs. crowd, Kelly P&L" },
            { file: "src/lib/settlement.ts", what: "where each forecast's brier and log_loss are written" },
          ]}
        />
        <Check
          q="Why is 0.25 the score for always saying 50%?"
          a="Because the error is 0.5 every single time — whether the event happens or not — and 0.5 squared is 0.25. It is the same for any outcome, which is what makes it such a clean baseline: a forecaster scoring worse than 0.25 is contributing less than silence."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={6}
        title="Calibration vs. being right"
        question="A forecaster can be well-calibrated and still useless. How?"
      >
        <p>
          Calibration asks a narrow question: when you say 30%, does it happen about 30% of the
          time? Sort every forecast into confidence buckets, compare the stated probability to the
          realized rate, and plot it.
        </p>
        <CalibrationDiagram />
        <p>
          The trap is that calibration alone is cheap. Predict the base rate for everything and you
          are perfectly calibrated and completely uninformative. What you also need is{" "}
          <strong className="text-foreground">resolution</strong> — the willingness to separate the
          likely from the unlikely and be right about which is which. The Brier score contains both,
          and the decomposition makes it explicit: Brier = reliability − resolution + uncertainty.
          Reliability is your distance from the diagonal above (lower is better), resolution is how
          much your forecasts actually spread outcomes apart (higher is better), and uncertainty is
          the irreducible difficulty of the questions themselves, identical for everyone.
        </p>
        <p>
          That last term is why you should never compare Brier scores across different question
          sets. A forecaster working on easy questions posts better numbers than a better forecaster
          working on hard ones. It is also why every comparison in this project is restricted to a
          shared set of resolved markets.
        </p>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={7}
        title="Why the ensemble is the real experiment"
        question="Six mediocre forecasters average to something better than any of them. When does that actually work?"
      >
        <p>
          This is the claim the project is built to test, and it is not obvious. Averaging six
          forecasts helps for a specific reason: each forecast is roughly signal plus error, and
          when you average, the signal reinforces while the errors partly cancel — but only to the
          extent the errors are independent.
        </p>
        <EnsembleDiagram />
        <p>
          That is why the roster is deliberately assembled from five companies across three regions
          rather than from six variants of the strongest model. Models trained on similar data with
          similar methods make similar mistakes, and correlated mistakes survive averaging intact.
          The{" "}
          <Link href="/analysis" className="text-primary hover:underline">
            error-correlation heatmap
          </Link>{" "}
          measures exactly this, and the ensemble-size curve on the same page shows how much each
          additional model is actually buying.
        </p>
        <p>
          It also predicts a specific failure, which is what the data shows: all six models share a
          skepticism bias, systematically under-predicting YES. That bias is in the shared column,
          not the independent one, so the ensemble inherits it undiminished. No amount of averaging
          fixes a prior that everyone holds.
        </p>
        <Check
          q="If the errors were perfectly correlated, what would the ensemble's Brier score be?"
          a="Identical to the average model's. Averaging six copies of the same opinion gives you the same opinion back. The gap between the ensemble's score and the average individual score is, in effect, a direct measurement of how much genuine diversity the roster has."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={8}
        title="Log-odds, and why the blend lives there"
        question="Why does the hybrid forecaster average logits instead of just averaging probabilities?"
      >
        <p>
          Probabilities are a bad scale for arithmetic on beliefs, because equal steps do not carry
          equal meaning near the ends.
        </p>
        <LogitDiagram />
        <p>
          Log-odds fixes this. In that space, evidence <em>adds</em>: Bayes&apos; rule becomes
          &quot;prior log-odds plus the weight of the evidence.&quot; It also has no boundary, so
          averaging cannot pull results toward the middle the way probability-space averaging does —
          which matters because a mean of raw probabilities is systematically less extreme than its
          inputs, making the pool under-confident by construction.
        </p>
        <p>
          The hybrid forecaster uses this to answer the project&apos;s actual question. It takes the
          market price as its anchor, converts both the price and the model consensus to log-odds,
          and blends them 80/20. The weight is not arbitrary — it comes from sweeping every weight
          from 0 to 1 across the settled history and reading off where the curve bottoms out. If the
          models carried no information the market lacked, the best weight would be 1.0 (all market)
          and the hybrid would be pointless.
        </p>
        <Aside title="The distinction that makes this honest">
          <p>
            That sweep is a <strong className="text-foreground">backtest</strong>: the weight was
            chosen with the outcomes already known, so of course it looks good. The hybrid forecaster
            on the leaderboard is the <strong className="text-foreground">out-of-sample</strong>{" "}
            version — the same fixed 0.8 rule, applied going forward to markets that had not resolved
            when the rule was set. Those two numbers are reported separately on the Findings page,
            and only the second one is evidence.
          </p>
        </Aside>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section
        n={9}
        title="How to read the results honestly"
        question="What would make you stop believing any of this?"
      >
        <p>
          A tutorial that ends with the results is only half of one. The harder skill is knowing
          which numbers deserve weight, so here is the short list of things that should make you
          discount a finding on these pages.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Small n.</strong> Brier differences of a few
            thousandths over a couple hundred markets are well inside noise. Every chart here reports
            its sample size; check it before you believe the ordering. The{" "}
            <Link href="/data" className="text-primary hover:underline">
              Data
            </Link>{" "}
            page puts confidence intervals on the headline gaps for exactly this reason.
          </li>
          <li>
            <strong className="text-foreground">In-sample tuning.</strong> Any rule chosen by looking
            at outcomes will look good on those outcomes. Only the forward-looking version counts.
          </li>
          <li>
            <strong className="text-foreground">Regime dependence.</strong> Forecast difficulty
            swings hard with the news cycle. A finding that holds in one half of the data and
            reverses in the other is a description of that period, not a fact about language models.
          </li>
          <li>
            <strong className="text-foreground">Survivorship in the market set.</strong> These are
            liquid, mid-priced, non-sports markets on one platform. Nothing here generalizes
            automatically to illiquid markets, to near-certain ones, or to questions nobody is
            trading.
          </li>
          <li>
            <strong className="text-foreground">Paper P&amp;L.</strong> It ignores fees, slippage,
            and the fact that your order would move the price. It is a sanity check on the skill
            numbers, never a trading result.
          </li>
        </ul>
        <p>
          There is a sixth item that deserves its own line, because it is the one that catches
          people who have already learned the other five:{" "}
          <strong className="text-foreground">
            a significant result can be an artifact of your own plumbing
          </strong>
          . The arena ran a standard test for whether the models lead the market — do prices move
          toward a model that disagrees with them? — and got a clean, significant yes. It was
          false. The market prices in our database are only refreshed for markets that still rank
          highly by volume, so most forecasts are made against a slightly stale snapshot, and a
          model with live web search &quot;predicts&quot; the moment that snapshot catches up. Split
          the sample by whether the price was actually fresh and the entire effect evaporates. The
          write-up is on the{" "}
          <Link href="/data" className="text-primary hover:underline">
            Data
          </Link>{" "}
          page. No amount of statistical care would have caught that — only knowing how the data was
          produced.
        </p>
        <p>
          The project has a second worked example of the same discipline: a learned bias correction
          that looked excellent in-sample made forecasts <em>worse</em> when fit on the earlier half
          of the data and tested on the later half. It was dropped, and the reason it was dropped is
          written up on the Findings page. That is the template — a result that fails the honest
          test is still a result.
        </p>
      </Section>

      <Separator />

      <Card className="border-dashed">
        <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Where to go next</p>
          <p>
            <Link href="/data" className="text-primary hover:underline">
              The Data
            </Link>{" "}
            — a tour of everything the arena has collected: what it costs, what it forecasts, which
            topics defeat it, and how much of the headline edge survives a confidence interval.
          </p>
          <p>
            <Link href="/insights" className="text-primary hover:underline">
              Findings
            </Link>{" "}
            — the four claims the settled data supports, recomputed live.{" "}
            <Link href="/analysis" className="text-primary hover:underline">
              The Lesson
            </Link>{" "}
            — the ensemble argument in three charts.{" "}
            <Link href="/methodology" className="text-primary hover:underline">
              Methodology
            </Link>{" "}
            — every formula, stated once.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
