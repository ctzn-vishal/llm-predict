import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How blind forecasts are collected, scored against the crowd, and pooled into an ensemble
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Blind forecasting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Each model is shown a market&apos;s question and description and asked for a single
            number: the probability that it resolves YES. Crucially, the model{" "}
            <strong className="text-foreground">never sees the market price</strong>. This is what
            makes the comparison meaningful — a model that could see the price could just echo it,
            and an ensemble of price-echoers would tell us nothing.
          </p>
          <p>
            Because the forecasts are blind, they are genuinely independent opinions. That
            independence is the entire premise behind pooling them: independent errors can cancel,
            correlated errors cannot.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The crowd baseline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            The market price is treated as its own forecaster, &ldquo;the Crowd.&rdquo; A market
            trading at 62&cent; is a 62% forecast that the event happens. The crowd aggregates the
            opinions (and money) of many humans and bots, so it is a strong, hard-to-beat baseline.
          </p>
          <p>
            Every model and the ensemble are scored on exactly the same resolved markets as the
            crowd, so <strong className="text-foreground">skill vs. crowd</strong> — the difference
            in Brier score on that shared set — is an apples-to-apples measure of who forecast
            better.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Market selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Markets come from Polymarket&apos;s Gamma API. We deliberately pick{" "}
            <strong className="text-foreground">short-horizon</strong> binary markets — roughly
            those resolving within seven days — and filter out illiquid or near-certain ones
            (prices are kept away from the 0/1 extremes). Short horizons mean forecasts resolve
            quickly, so the leaderboard reflects real, settled outcomes rather than open bets.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Scoring: skill first</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>Once a market resolves, each valid forecast is scored on several axes:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Brier score</strong> — mean squared error between
              the forecast and the outcome. 0 is perfect; 0.25 is a coin flip. Lower is better.
            </li>
            <li>
              <strong className="text-foreground">Log loss</strong> — penalizes confident mistakes
              far more harshly than Brier. Probabilities are clamped away from 0 and 1 so a single
              wrong &ldquo;certainty&rdquo; doesn&apos;t produce an infinite score.
            </li>
            <li>
              <strong className="text-foreground">Expected calibration error (ECE)</strong> — bins
              forecasts by confidence and measures the average gap between stated confidence and
              actual hit rate. The calibration chart visualizes the same data.
            </li>
            <li>
              <strong className="text-foreground">Brier decomposition</strong> — Brier = reliability
              − resolution + uncertainty. <em>Reliability</em> (lower is better) is calibration
              within each confidence bucket; <em>resolution</em> (higher is better) is how
              decisively a forecaster separates winners from losers; <em>uncertainty</em> is the
              irreducible base-rate variance, identical for everyone on the shared set.
            </li>
            <li>
              <strong className="text-foreground">Skill vs. crowd</strong> — the headline number:
              crowd Brier minus the forecaster&apos;s Brier on shared markets. Positive means it
              beat the market.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The ensemble</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            The ensemble&apos;s forecast for a market is simply the{" "}
            <strong className="text-foreground">mean of the valid model probabilities</strong> for
            that market — no weighting, no tuning. It costs nothing extra to compute. If a model
            failed to return a usable forecast, it is left out of that market&apos;s average rather
            than substituted with a default.
          </p>
          <p>The Lesson page probes three questions about this average:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Does it beat its parts?</strong> Ensemble Brier
              vs. the average single model, the best single model, and the crowd.
            </li>
            <li>
              <strong className="text-foreground">How many models do you need?</strong> We average
              the Brier of every k-model subset to show the marginal value of each added model.
            </li>
            <li>
              <strong className="text-foreground">Why does it work?</strong> The Pearson
              correlation of forecast errors between each pair of models. Low correlation means
              independent mistakes, which is exactly what averaging can cancel out.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Market × Models (the hybrid)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            One forecaster on the leaderboard is deliberately <em>not</em> blind.{" "}
            <strong className="text-foreground">Market × Models</strong> blends the market price
            with the model consensus in log-odds space:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              logit(p) = 0.8 · logit(price) + 0.2 · mean(logit(p_model))
            </code>
            . The 80/20 split and the log-odds scale come from a backtest on the arena&apos;s own
            settled forecasts (see{" "}
            <a href="/insights" className="text-primary hover:underline">
              Findings
            </a>
            ), where this blend scored a better Brier than the market price alone. Its job on the
            leaderboard is to keep testing that claim out of sample: if the models truly add
            information the market hasn&apos;t priced, Market × Models should keep beating the
            crowd going forward. Its forecasts cost nothing — they are pure arithmetic over
            numbers the arena already stores.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Failures are visible, never hidden</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Every forecast row records whether the model returned a valid response. A model that
            errors, times out, or returns an unparseable answer is marked as a failure and{" "}
            <strong className="text-foreground">excluded from scoring</strong> — it is never quietly
            coerced into a default probability. The leaderboard&apos;s &ldquo;reliability&rdquo;
            column is that valid-response rate, so pipeline and model failures show up honestly
            instead of inflating or deflating the skill numbers.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Secondary view: paper P&amp;L</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            As a clearly-labeled secondary metric, we simulate Kelly-staking each forecaster&apos;s
            edge over the crowd at the crowd&apos;s own odds. It answers &ldquo;could you have made
            money acting on this disagreement?&rdquo; The crowd scores exactly zero by construction,
            since it never disagrees with itself. This is a sanity check on the skill numbers, not
            the headline.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cohorts &amp; data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Competition is grouped into weekly cohorts (ISO week ids like 2026-W22) so results can
            be compared across different market conditions. Rounds collect forecasts twice daily;
            settlement checks for resolved markets every few hours; a new cohort opens each Monday.
          </p>
          <p>
            Market data comes from the Polymarket Gamma API and model calls go through OpenRouter
            at temperature 0 for reproducibility. Every forecast — prompt, raw response, cost, and
            score — is stored in a Turso (libSQL) database for full auditability.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Limitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Sample sizes are small, especially early on. Brier differences of a few thousandths
              are not statistically meaningful yet — treat the leaderboard as indicative.
            </li>
            <li>
              Web search is available to models via OpenRouter&apos;s plugins API, but search
              quality varies by provider and run.
            </li>
            <li>
              The paper P&amp;L ignores execution costs, slippage, and liquidity. It is illustrative
              only.
            </li>
            <li>
              The ensemble is an unweighted mean. Smarter aggregation (weighting by past skill,
              extremizing) could do better and is not attempted here.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Separator />

      <p className="pb-8 text-xs text-muted-foreground">
        An open teaching project on forecast aggregation. All code, data, and methodology are
        designed for transparency and reproducibility.
      </p>
    </div>
  );
}
