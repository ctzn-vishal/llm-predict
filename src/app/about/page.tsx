import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function AboutPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">About</h1>
        <p className="text-sm text-muted-foreground mt-1">
          An academic-grade benchmark where 7 models compete on real Polymarket prediction markets
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The Problem with LLM Benchmarks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            Traditional LLM benchmarks are contaminated by training data. Models can
            memorize answers to MMLU, HumanEval, and other static datasets, making
            scores increasingly meaningless as benchmarks leak into training corpora.
          </p>
          <p>
            Prediction markets offer a fundamentally different approach: they test
            <strong className="text-foreground"> genuine forecasting ability</strong> about
            future events that cannot exist in any training corpus. When a model
            predicts whether Bitcoin will exceed $150K by March 2026, there is no
            training data to memorize &mdash; only reasoning, research, and calibration.
          </p>
          <p className="text-xs">
            Inspired by{" "}
            <a href="https://forecasterarena.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              Forecaster Arena
            </a>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              A new <strong className="text-foreground">weekly cohort</strong> is
              auto-created each Monday (e.g., 2026-W07). Every model gets a fresh
              $10,000 virtual bankroll.
            </li>
            <li>
              <strong className="text-foreground">Rounds run automatically</strong> twice
              daily at 10:00 and 22:00 UTC. Each round presents 10-20 real Polymarket
              questions to all 6 LLMs (plus a 7th ensemble).
            </li>
            <li>
              Models research via <strong className="text-foreground">web search</strong>{" "}
              (OpenRouter plugins API, Exa.ai-powered), then bet YES, bet NO, or PASS
              on each market. If a model has previously bet on the same market in this
              cohort, it sees its prior positions for re-evaluation.
            </li>
            <li>
              A <strong className="text-foreground">7th ensemble model</strong> automatically
              aggregates the 6 predictions via majority vote + mean probability at zero API cost.
            </li>
            <li>
              <strong className="text-foreground">Settlement runs every 4 hours</strong> &mdash;
              resolved markets are checked, P&amp;L and Brier scores computed. Voided
              markets get full refunds. Pass bets are properly closed.
            </li>
            <li>
              At week&apos;s end, the cohort enters <strong className="text-foreground">settling</strong>{" "}
              status while remaining bets resolve, then auto-completes when all bets
              are settled.
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The 7 Competing Models</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 font-medium text-foreground">Model</th>
                  <th className="pb-2 font-medium text-foreground">Provider</th>
                  <th className="pb-2 font-medium text-foreground">Cost (in/out per 1M)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr><td className="py-2">Gemini 3 Flash</td><td>Google</td><td className="font-mono">$0.50 / $3.00</td></tr>
                <tr><td className="py-2">Grok 4.1 Fast</td><td>xAI</td><td className="font-mono">$0.20 / $0.50</td></tr>
                <tr><td className="py-2">GPT-5.2 Chat</td><td>OpenAI</td><td className="font-mono">$1.75 / $14.00</td></tr>
                <tr><td className="py-2">DeepSeek V3.2</td><td>DeepSeek</td><td className="font-mono">$0.25 / $0.38</td></tr>
                <tr><td className="py-2">Kimi K2.5</td><td>Moonshot AI</td><td className="font-mono">$0.45 / $2.25</td></tr>
                <tr><td className="py-2">Qwen 3 235B</td><td>Alibaba</td><td className="font-mono">$0.20 / $0.60</td></tr>
                <tr className="text-foreground font-medium"><td className="py-2">Ensemble (Avg)</td><td>Aggregate</td><td className="font-mono">$0.00</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            The ensemble aggregates independent forecasts at zero cost. Superforecasting
            research shows that crowd aggregation consistently beats individual forecasters.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dual Scoring System</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Brier Score</strong> (calibration):
              mean squared error between predicted probabilities and actual outcomes.
              0 = perfect, 0.25 = coin flip. Applied only to non-pass bets.
            </li>
            <li>
              <strong className="text-foreground">Portfolio P&amp;L</strong> (value):
              can the model translate predictions into profit? Each model starts with
              $10,000 and must manage position sizing.
            </li>
            <li>
              <strong className="text-foreground">Market Difficulty</strong>: binary
              entropy of market price at bet time. A 50/50 market (difficulty=1.0) is
              maximally hard; a 95/5 market (difficulty=0.29) is easy.
            </li>
            <li>
              <strong className="text-foreground">Correlated Market Detection</strong>:
              Jaccard similarity on question text clusters related markets. Adjusted P&amp;L
              deduplicates within clusters to prevent amplified swings.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Key Design Decisions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-foreground">Turso/libSQL</strong>: SQLite-compatible
              edge database. Local file for dev, Turso cloud for production.
            </li>
            <li>
              <strong className="text-foreground">OpenRouter</strong>: single API for 6
              providers. Unified billing, web search plugins, structured output.
            </li>
            <li>
              <strong className="text-foreground">Plugins web search</strong> (not
              :online suffix): doesn&apos;t change model routing, unlike :online which
              may silently swap model versions.
            </li>
            <li>
              <strong className="text-foreground">Weekly cohorts with settling</strong>:
              fresh bankrolls prevent compounding. Bets resolve across boundaries.
            </li>
            <li>
              <strong className="text-foreground">temperature: 0</strong> for all models.
              Deterministic output for reproducibility.
            </li>
            <li>
              <strong className="text-foreground">Full audit trail</strong>: every bet
              stores the exact prompt and raw response.
            </li>
            <li>
              <strong className="text-foreground">$100 budget cap</strong>: hard limit on
              API spend. Rounds stop automatically when reached.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tech Stack</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed">
          <div className="grid grid-cols-2 gap-2">
            <div><strong className="text-foreground">Framework:</strong> Next.js 16</div>
            <div><strong className="text-foreground">Language:</strong> TypeScript</div>
            <div><strong className="text-foreground">Styling:</strong> Tailwind v4 + shadcn/ui</div>
            <div><strong className="text-foreground">Charts:</strong> Recharts</div>
            <div><strong className="text-foreground">Database:</strong> Turso (libSQL)</div>
            <div><strong className="text-foreground">LLM Gateway:</strong> OpenRouter</div>
            <div><strong className="text-foreground">Market Data:</strong> Polymarket Gamma API</div>
            <div><strong className="text-foreground">Scheduling:</strong> Vercel Cron</div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-2 pb-8">
        <p className="text-xs text-muted-foreground">
          Research project. Not financial advice. No real money is wagered.
        </p>
        <div className="flex flex-wrap gap-4 text-xs">
          <a href="https://github.com/ctzn-vishal/llm-predict" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="https://polymarket.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            Polymarket
          </a>
          <a href="https://openrouter.ai/docs" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            OpenRouter
          </a>
          <a href="https://forecasterarena.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            Forecaster Arena
          </a>
          <a href="https://en.wikipedia.org/wiki/Brier_score" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            Brier Score
          </a>
        </div>
      </div>
    </div>
  );
}
