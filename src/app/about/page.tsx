import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MODELS_ONLY } from "@/lib/models";

const price = (n?: number) => (n == null ? "—" : `$${n.toFixed(n < 0.1 ? 3 : 2)}`);

export default function AboutPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">About</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Six LLMs make blind forecasts on real prediction markets — then we ask whether pooling
          them into an ensemble beats the crowd
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Why prediction markets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Traditional LLM benchmarks leak into training data. Models can memorize answers to MMLU,
            HumanEval, and other static datasets, so scores drift further from genuine ability every
            time a benchmark is scraped into a training corpus.
          </p>
          <p>
            Prediction markets test something that cannot be memorized:{" "}
            <strong className="text-foreground">forecasting a future that has not happened yet</strong>
            . When a model estimates the probability that an event resolves YES next week, there is
            no answer key to recall — only reasoning, research, and calibration.
          </p>
          <p>
            But this project asks a sharper question than &ldquo;which model forecasts best?&rdquo;
            It asks <strong className="text-foreground">how much you gain by combining them</strong>.
            That is the entire point of the ensemble, and it only works if the individual forecasts
            are genuinely independent.
          </p>
          <p className="text-xs">
            Inspired by{" "}
            <a
              href="https://forecasterarena.com"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Forecaster Arena
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              We pull <strong className="text-foreground">short-horizon</strong> binary markets from
              Polymarket — mostly those resolving within about a week — so forecasts settle quickly
              and the leaderboard reflects real outcomes, not open bets.
            </li>
            <li>
              Each model is shown only the market&apos;s question and description and asked for one
              number: the probability of YES. Crucially it{" "}
              <strong className="text-foreground">never sees the market price</strong>. A model that
              could peek at the price could just echo it, and an ensemble of price-echoers would
              teach us nothing.
            </li>
            <li>
              The market price is scored as its own forecaster, &ldquo;
              <strong className="text-foreground">the Crowd</strong>.&rdquo; A market at 62&cent; is a
              62% forecast. The crowd pools the money and opinions of many humans and bots, so it is a
              strong, hard-to-beat baseline.
            </li>
            <li>
              The <strong className="text-foreground">ensemble</strong> is simply the unweighted mean
              of the valid model probabilities for each market — no tuning, no weighting, zero extra
              API cost. If a model fails to return a usable forecast, it is left out of that
              market&apos;s average rather than coerced into a default.
            </li>
            <li>
              Rounds run automatically twice daily (10:00 and 22:00 UTC). Settlement checks for
              resolved markets every few hours and computes each forecaster&apos;s scores. A fresh
              weekly cohort opens every Monday.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The forecasters</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 font-medium text-foreground">Forecaster</th>
                  <th className="pb-2 font-medium text-foreground">Provider</th>
                  <th className="pb-2 font-medium text-foreground">Cost (in / out per 1M)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MODELS_ONLY.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2">
                      <span className="mr-2">{m.emoji}</span>
                      {m.name}
                    </td>
                    <td>{m.provider}</td>
                    <td className="font-mono">
                      {price(m.costIn)} / {price(m.costOut)}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium text-foreground">
                  <td className="py-2">
                    <span className="mr-2">🎯</span>Ensemble (mean)
                  </td>
                  <td>Aggregate</td>
                  <td className="font-mono">$0.00</td>
                </tr>
                <tr className="text-foreground">
                  <td className="py-2">
                    <span className="mr-2">👥</span>The Crowd
                  </td>
                  <td>Polymarket</td>
                  <td className="font-mono">baseline</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            We deliberately pick capable but inexpensive recent models, and lean on{" "}
            <strong className="text-foreground">provider diversity</strong> (US, EU, and China labs).
            Diverse models tend to make uncorrelated mistakes — and uncorrelated errors are exactly
            what averaging can cancel out.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scoring: skill first</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Brier score</strong> — mean squared error between
              the forecast and the outcome. 0 is perfect; 0.25 is a coin flip. Lower is better.
            </li>
            <li>
              <strong className="text-foreground">Log loss</strong> — punishes confident mistakes far
              more harshly than Brier, with probabilities clamped away from 0 and 1.
            </li>
            <li>
              <strong className="text-foreground">Calibration (ECE)</strong> — when a forecaster says
              70%, does it happen about 70% of the time? Visualized on each profile&apos;s calibration
              chart.
            </li>
            <li>
              <strong className="text-foreground">Skill vs. crowd</strong> — the headline number:
              crowd Brier minus the forecaster&apos;s Brier on the same resolved markets. Positive
              means it beat the market.
            </li>
            <li>
              <strong className="text-foreground">Paper P&amp;L</strong> — a clearly-labeled{" "}
              <em>secondary</em> view that Kelly-stakes each forecaster&apos;s edge over the crowd. It
              is a sanity check on the skill numbers, never the headline.
            </li>
          </ul>
          <p>
            Every forecaster — the six models, the ensemble, and the crowd — is scored on exactly the
            same shared set of resolved markets, so the comparison is apples-to-apples.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Design decisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Blind forecasts</strong>: hiding the market price is
              what makes the forecasts independent — and independence is what makes the ensemble
              meaningful.
            </li>
            <li>
              <strong className="text-foreground">Failures are visible</strong>: a model that errors,
              times out, or returns an unparseable answer is marked failed and excluded from scoring,
              never coerced into a default probability. The leaderboard&apos;s reliability column is
              that valid-response rate.
            </li>
            <li>
              <strong className="text-foreground">Plugins web search</strong> (not the{" "}
              <code>:online</code> suffix): models can research without silently swapping versions.
            </li>
            <li>
              <strong className="text-foreground">temperature: 0</strong> for every model, so runs are
              reproducible.
            </li>
            <li>
              <strong className="text-foreground">Full audit trail</strong>: every forecast stores its
              prompt, raw response, cost, and score in the database.
            </li>
            <li>
              <strong className="text-foreground">Budget cap</strong>: a hard limit on API spend;
              rounds stop automatically when it is reached.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tech stack</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <strong className="text-foreground">Framework:</strong> Next.js 16
            </div>
            <div>
              <strong className="text-foreground">Language:</strong> TypeScript
            </div>
            <div>
              <strong className="text-foreground">Styling:</strong> Tailwind v4 + shadcn/ui
            </div>
            <div>
              <strong className="text-foreground">Charts:</strong> Recharts
            </div>
            <div>
              <strong className="text-foreground">Database:</strong> Turso (libSQL)
            </div>
            <div>
              <strong className="text-foreground">LLM Gateway:</strong> OpenRouter
            </div>
            <div>
              <strong className="text-foreground">Market Data:</strong> Polymarket Gamma API
            </div>
            <div>
              <strong className="text-foreground">Scheduling:</strong> Vercel Cron
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-2 pb-8">
        <p className="text-xs text-muted-foreground">
          An open teaching project on forecast aggregation. Not financial advice. No real money is
          wagered.
        </p>
        <div className="flex flex-wrap gap-4 text-xs">
          <a
            href="https://github.com/ctzn-vishal/llm-predict"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://polymarket.com"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Polymarket
          </a>
          <a
            href="https://openrouter.ai/docs"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenRouter
          </a>
          <a
            href="https://forecasterarena.com"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Forecaster Arena
          </a>
          <a
            href="https://en.wikipedia.org/wiki/Brier_score"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Brier Score
          </a>
        </div>
      </div>
    </div>
  );
}
