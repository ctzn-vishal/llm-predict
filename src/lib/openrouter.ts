import {
  PredictionSchema,
  PREDICTION_JSON_SCHEMA,
  type Prediction,
  type MarketRow,
} from "@/lib/schemas";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

// ---------------------------------------------------------------------------
// System prompt for prediction
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a professional forecaster competing in a prediction market tournament.
Your goal is to make well-calibrated probability estimates and profitable betting decisions.

You will be given a prediction market question along with current market prices.
You have access to the internet via web search to research the question.

Analyze the question carefully, research relevant information, and provide:
1. Your estimated probability of the event occurring
2. Whether to bet YES, bet NO, or PASS (if no edge)
3. Your confidence level (0-1)
4. Suggested bet size as a percentage of bankroll (1-25%)
5. Clear reasoning and key factors

Respond ONLY with valid JSON matching the required schema. Do not include any other text.`;

// ---------------------------------------------------------------------------
// Re-eval context for previous bets
// ---------------------------------------------------------------------------
export interface PreviousBetContext {
  action: string;
  market_price_at_bet: number | null;
  estimated_probability: number | null;
  confidence: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Build the user prompt for a specific market
// ---------------------------------------------------------------------------
function buildPrompt(market: MarketRow, previousBets?: PreviousBetContext[]): string {
  let previousBetsSection = "";
  if (previousBets && previousBets.length > 0) {
    previousBetsSection = `\n**Your Previous Bets on This Market (this cohort):**
${previousBets.map(b => `- [${b.created_at}]: ${b.action} at market price $${b.market_price_at_bet?.toFixed(2) ?? 'N/A'}, your estimated prob: ${b.estimated_probability?.toFixed(2) ?? 'N/A'}, confidence: ${b.confidence?.toFixed(2) ?? 'N/A'}`).join('\n')}

Consider whether new information warrants changing your position.
`;
  }

  return `## Prediction Market Question

**Question:** ${market.question}

**Description:** ${market.description ?? "N/A"}

**Current Market Prices:**
- YES: $${market.yes_price?.toFixed(2) ?? "N/A"}
- NO: $${market.no_price?.toFixed(2) ?? "N/A"}

**24h Volume:** $${market.volume_24h?.toLocaleString() ?? "N/A"}
**Market End Date:** ${market.end_date ?? "N/A"}
**Market ID:** ${market.id}
**Polymarket Slug:** ${market.slug ?? "N/A"}
${previousBetsSection}
Research this question using web search. Then provide your prediction as JSON.`;
}

// ---------------------------------------------------------------------------
// Call a model via OpenRouter
// ---------------------------------------------------------------------------
export async function callModel(
  openrouterId: string,
  market: MarketRow,
  previousBets?: PreviousBetContext[],
): Promise<{
  prediction: Prediction | null;
  rawResponse: string;
  cost: number;
  latencyMs: number;
}> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const userPrompt = buildPrompt(market, previousBets);

  const body = {
    model: openrouterId,
    plugins: [{ id: "web", max_results: 5 }],
    temperature: 0,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: PREDICTION_JSON_SCHEMA,
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startMs = Date.now();

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://llm-prediction-arena.vercel.app",
          "X-Title": "LLM Prediction Arena",
        },
        body: JSON.stringify(
          attempt === 0
            ? body
            : {
                // Fallback: simpler json_object format on retry
                ...body,
                response_format: { type: "json_object" },
              },
        ),
      });

      const latencyMs = Date.now() - startMs;

      if (res.status === 429) {
        // Rate limited -- retry with backoff
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new Error("Rate limited after max retries");
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const rawResponse = data.choices?.[0]?.message?.content ?? "";

      // Calculate cost from usage
      const usage = data.usage ?? {};
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      // OpenRouter returns cost in the generation object or we estimate
      const cost =
        data.usage?.total_cost ??
        (promptTokens * 0.000001 + completionTokens * 0.000002);

      // Parse and validate the prediction
      let prediction: Prediction | null = null;
      try {
        const parsed = JSON.parse(rawResponse);
        prediction = PredictionSchema.parse(parsed);
      } catch {
        // Could not parse valid prediction -- forced pass
        prediction = null;
      }

      return { prediction, rawResponse, cost, latencyMs };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }

  throw lastError ?? new Error("callModel failed after retries");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { buildPrompt, SYSTEM_PROMPT };
