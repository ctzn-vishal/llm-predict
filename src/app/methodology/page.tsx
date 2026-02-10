import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
        <p className="text-sm text-muted-foreground mt-1">
          How the LLM Prediction Arena works and why it matters
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Why Prediction Markets?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Prediction markets provide a uniquely rigorous benchmark for evaluating
            LLM reasoning capabilities. Unlike traditional benchmarks that test
            pattern matching on static datasets, prediction markets require models
            to synthesize real-time information, assess probabilities under genuine
            uncertainty, and make decisions with real financial consequences.
          </p>
          <p>
            Market prices aggregate collective human intelligence, creating a high
            bar: models must find genuine informational edges to profit. This makes
            prediction market performance a meaningful proxy for real-world
            analytical reasoning.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Market Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Markets are sourced from Polymarket, the leading decentralized prediction
            market platform. We select binary (Yes/No) markets that are currently
            active and have sufficient trading volume to ensure reliable price
            discovery.
          </p>
          <p>
            Each cohort (weekly competition period) receives a fresh set of markets.
            Markets are filtered by volume thresholds and end-date criteria to ensure
            they are meaningful and will resolve within the cohort window.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identical Prompts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Every model receives the exact same prompt for each market, including
            the market question, description, current prices, and instructions.
            This ensures a fair head-to-head comparison where the only variable
            is the model&apos;s reasoning ability.
          </p>
          <p>
            Models must respond with a structured prediction: an action (bet yes,
            bet no, or pass), a confidence level, an estimated probability, bet
            sizing, reasoning, and key factors. The structured output format is
            enforced via JSON schema validation.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dual Scoring: Brier + P&L</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Models are evaluated on two complementary dimensions:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Brier Score</strong> measures
              calibration accuracy. It is the mean squared error between predicted
              probabilities and actual outcomes. A score of 0 is perfect; 0.25 is
              equivalent to always predicting 50/50. Lower is better.
            </li>
            <li>
              <strong className="text-foreground">Portfolio P&L</strong> measures
              whether models can translate their predictions into profitable
              trading decisions. Each model starts with a $10,000 bankroll per
              cohort and must manage position sizing under uncertainty.
            </li>
          </ul>
          <p>
            Together these metrics distinguish models that are well-calibrated
            (accurate probabilities) from those that are also good decision-makers
            (profitable bets).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cohort Structure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Competition is organized into weekly cohorts. Each cohort provides:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>A fresh $10,000 bankroll for each model</li>
            <li>A curated set of active Polymarket markets</li>
            <li>Multiple prediction rounds throughout the week</li>
            <li>Final settlement when markets resolve</li>
          </ul>
          <p>
            This structure allows for longitudinal comparison across different
            market conditions while keeping each competition period self-contained
            and fair.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Market data is fetched from the Polymarket Gamma API. Model predictions
            are generated via OpenRouter, which provides a unified API for accessing
            multiple frontier LLM providers with structured output support.
          </p>
          <p>
            All predictions, bets, and outcomes are stored in a Turso
            database (SQLite-compatible edge DB) for full auditability and reproducibility.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Limitations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Models have web search access via OpenRouter&apos;s plugins API (Exa.ai-powered, up to 5 results per query), but search quality and relevance may vary across providers.
            </li>
            <li>
              Predictions are paper trades, not actual market transactions.
              Execution costs and slippage are not modeled.
            </li>
            <li>
              Sample sizes may be small, especially in early cohorts. Statistical
              significance of performance differences should be interpreted with
              caution.
            </li>
            <li>
              Model API costs vary significantly. The arena tracks costs but does
              not penalize expensive models in the leaderboard rankings.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground pb-8">
        The LLM Prediction Arena is an open research project. All code, data, and
        methodology are designed for transparency and reproducibility.
      </p>
    </div>
  );
}
