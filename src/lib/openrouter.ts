import {
  ForecastSchema,
  FORECAST_JSON_SCHEMA,
  DecisionSchema,
  DECISION_JSON_SCHEMA,
  type BetSide,
  type MarketRow,
} from "@/lib/schemas";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [800, 2000, 5000];
// Bound a single attempt so one slow provider can't stall a whole round.
// Successful blind forecasts (web search + short JSON) return in <=10s in
// practice, so 30s is generous headroom; a request that blows it is treated as
// a fail-fast (see the catch block -- we do NOT retry a timed-out attempt,
// which would otherwise burn another full timeout window per retry).
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// System prompt -- BLIND. The model never sees the market price, so its
// probability is independent of the crowd. That independence is what makes the
// "can the committee beat the crowd?" comparison meaningful.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a professional forecaster. You will be given a real-world yes/no question that resolves in the near future.

Your job: estimate the TRUE probability that the question resolves YES, as a number between 0 and 1.

Guidelines:
- Use web search to gather current, relevant facts before answering.
- Think in terms of base rates, then adjust for specific evidence.
- Be well-calibrated: if you say 0.70, the event should happen about 70% of the time. Avoid unwarranted 0.0 or 1.0.
- You are NOT told any market price or betting odds. Form your own independent estimate.
- Keep reasoning concise (2-4 sentences) and list the key factors.

Respond ONLY with valid JSON matching the required schema. No prose outside the JSON.`;

function fmtDate(iso: string | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function buildForecastPrompt(market: MarketRow): string {
  return `# Question
${market.question}

## Background
${market.description?.trim() || "No additional description provided."}

## Resolution
This question resolves by ${fmtDate(market.end_date)}.

Research the question with web search, then return your independent probability that it resolves YES, a short reasoning, and the key factors.`;
}

export interface ForecastResult {
  ok: boolean;
  prob: number | null;
  reasoning: string | null;
  keyFactors: string[] | null;
  raw: string;
  cost: number;
  latencyMs: number;
  error: string | null;
  promptText: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Pull a forecast object out of model text even if it wrapped it in prose or
// ```json fences (some models ignore strict JSON mode).
function extractForecast(raw: string): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const brace = raw.match(/\{[\s\S]*\}/);
  if (brace) {
    try {
      return JSON.parse(brace[0]);
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Ask one model for a BLIND probability forecast on a market.
 * Never throws: failures come back as { ok: false, error } so the pipeline can
 * record them visibly instead of silently coercing them into a default.
 */
export async function forecastMarket(
  openrouterId: string,
  market: MarketRow,
): Promise<ForecastResult> {
  const promptText = buildForecastPrompt(market);
  const base: ForecastResult = {
    ok: false,
    prob: null,
    reasoning: null,
    keyFactors: null,
    raw: "",
    cost: 0,
    latencyMs: 0,
    error: null,
    promptText,
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ...base, error: "OPENROUTER_API_KEY not set" };

  const body = {
    model: openrouterId,
    // Force the Exa web engine for ALL models. Without `engine`, OpenRouter
    // defaults to a model's NATIVE search where available -- which for Gemini
    // means Google grounding (~$0.13/call, ~25x the others) and, on
    // gemini-3.1-flash-lite, silently returns NO web results at all (the model
    // then forecasts blind from stale training). Exa runs server-side for every
    // model: uniform ~$0.005/call, real citations, and a level playing field so
    // forecasters differ only in reasoning -- not in search backend.
    plugins: [{ id: "web", engine: "exa", max_results: 4 }],
    temperature: 0,
    max_tokens: 1800,
    usage: { include: true },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: promptText },
    ],
    response_format: { type: "json_schema", json_schema: FORECAST_JSON_SCHEMA },
  };

  let lastError = "unknown error";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startMs = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      // On retry, drop strict json_schema in favour of plain json_object --
      // some models reject the strict schema.
      const reqBody =
        attempt === 0
          ? body
          : { ...body, response_format: { type: "json_object" as const } };

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://llm-prediction-arena.vercel.app",
          "X-Title": "Wisdom of Artificial Crowds",
        },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startMs;

      // Retry transient errors; fail fast on the rest (e.g. 402 no credits).
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return { ...base, latencyMs, error: `${lastError} after ${MAX_RETRIES} retries` };
      }
      if (!res.ok) {
        const txt = await res.text();
        return { ...base, latencyMs, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
      }

      const data = await res.json();
      const msg = data.choices?.[0]?.message ?? {};
      const raw: string = msg.content ?? "";
      const usage = data.usage ?? {};
      const cost: number =
        usage.cost ??
        usage.total_cost ??
        (usage.prompt_tokens ?? 0) * 1e-6 + (usage.completion_tokens ?? 0) * 2e-6;

      const parsed = extractForecast(raw);
      const validated = parsed ? ForecastSchema.safeParse(parsed) : null;
      if (!validated || !validated.success) {
        // Couldn't parse a valid forecast. Retry once in json_object mode.
        lastError = raw ? "unparseable forecast JSON" : "empty response";
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return { ...base, raw, cost, latencyMs, error: lastError };
      }

      const prob = Math.min(1, Math.max(0, validated.data.probability_yes));
      return {
        ok: true,
        prob,
        reasoning: validated.data.reasoning,
        keyFactors: validated.data.key_factors,
        raw,
        cost,
        latencyMs,
        error: null,
        promptText,
      };
    } catch (err) {
      const timedOut = controller.signal.aborted;
      lastError = timedOut
        ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
      // Fail fast on a timeout: retrying just burns another full timeout
      // window. Only retry genuine transient network errors.
      if (!timedOut && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return { ...base, latencyMs: Date.now() - startMs, error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ...base, error: lastError };
}

// ---------------------------------------------------------------------------
// STAGE 2 -- the bet/pass decision.
//
// Unlike the blind forecast this call DOES see the price, and it runs no web
// search: the research already happened in stage 1, so this is a short, cheap,
// fast call (~10x cheaper, since search is the dominant cost). That budget is
// spent on retries instead, because a stage-2 failure would otherwise hand an
// unreliable model a free abstention -- and abstention is the very thing being
// measured.
// ---------------------------------------------------------------------------
const DECISION_SYSTEM_PROMPT = `You are a disciplined forecaster deciding whether to act on your own prediction.

You already made an independent estimate of this event WITHOUT seeing the market. Now you are shown the market's price. Your job is one decision: is your disagreement with the market worth betting on?

Guidelines:
- The market price aggregates many informed participants with money at stake. It is usually right. A difference between your number and the price is more often YOUR error than the market's.
- BET only when you have a concrete reason to believe you know something the price does not reflect — specific evidence, a rule the market may have misread, a base rate you trust.
- PASS when your estimate was a rough guess, when the question turns on information you lack, or when the gap is small enough to be noise.
- Passing is free and costs you nothing. A bad bet costs real money. There is no reward for participating.
- You are NOT choosing a side or a stake — only whether to act at all.

Respond ONLY with valid JSON matching the required schema.`;

export interface DecisionResult {
  ok: boolean;
  action: "bet" | "pass" | null;
  rationale: string | null;
  raw: string;
  cost: number;
  latencyMs: number;
  error: string | null;
  promptText: string;
}

export function buildDecisionPrompt(
  market: MarketRow,
  probYes: number,
  price: number,
  side: BetSide,
  ownReasoning: string | null,
): string {
  const edge = Math.abs(probYes - price) * 100;
  return `# Question
${market.question}

## Your blind estimate (made without seeing the market)
P(YES) = ${(probYes * 100).toFixed(0)}%
${ownReasoning ? `Your reasoning at the time: ${ownReasoning}` : ""}

## The market
The market currently prices YES at ${(price * 100).toFixed(0)}%.

You are ${edge.toFixed(0)} percentage points ${probYes >= price ? "ABOVE" : "BELOW"} the market. Acting on this would mean backing ${side.toUpperCase()}.

## Your decision
Is this disagreement worth betting on, or is the market more likely to be right than you? Answer "bet" or "pass" with one sentence of rationale.`;
}

/**
 * Ask one model whether to act on its own forecast. Never throws; failures come
 * back as { ok: false, error } so the pipeline records them with ok=0 and drops
 * the market from BOTH arms of that model's paired comparison.
 */
export async function decideBet(
  openrouterId: string,
  market: MarketRow,
  probYes: number,
  price: number,
  side: BetSide,
  ownReasoning: string | null,
): Promise<DecisionResult> {
  const promptText = buildDecisionPrompt(market, probYes, price, side, ownReasoning);
  const base: DecisionResult = {
    ok: false,
    action: null,
    rationale: null,
    raw: "",
    cost: 0,
    latencyMs: 0,
    error: null,
    promptText,
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ...base, error: "OPENROUTER_API_KEY not set" };

  const body = {
    model: openrouterId,
    // No web search: stage 1 already did the research, and this call is a
    // judgement about that research rather than a fresh look at the world.
    temperature: 0,
    max_tokens: 400,
    usage: { include: true },
    messages: [
      { role: "system", content: DECISION_SYSTEM_PROMPT },
      { role: "user", content: promptText },
    ],
    response_format: { type: "json_schema", json_schema: DECISION_JSON_SCHEMA },
  };

  let lastError = "unknown error";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startMs = Date.now();
    const controller = new AbortController();
    // Half the stage-1 budget: no search, few tokens, so a slow response here
    // is a stuck provider rather than deep work.
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const reqBody =
        attempt === 0
          ? body
          : { ...body, response_format: { type: "json_object" as const } };

      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://llm-prediction-arena.vercel.app",
          "X-Title": "Wisdom of Artificial Crowds",
        },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startMs;

      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return { ...base, latencyMs, error: `${lastError} after ${MAX_RETRIES} retries` };
      }
      if (!res.ok) {
        const txt = await res.text();
        return { ...base, latencyMs, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
      }

      const data = await res.json();
      const raw: string = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? {};
      const cost: number =
        usage.cost ??
        usage.total_cost ??
        (usage.prompt_tokens ?? 0) * 1e-6 + (usage.completion_tokens ?? 0) * 2e-6;

      const parsed = extractForecast(raw); // same lenient JSON extraction
      const validated = parsed ? DecisionSchema.safeParse(parsed) : null;
      if (!validated || !validated.success) {
        lastError = raw ? "unparseable decision JSON" : "empty response";
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return { ...base, raw, cost, latencyMs, error: lastError };
      }

      return {
        ok: true,
        action: validated.data.action,
        rationale: validated.data.rationale,
        raw,
        cost,
        latencyMs,
        error: null,
        promptText,
      };
    } catch (err) {
      const timedOut = controller.signal.aborted;
      lastError = timedOut
        ? "timeout after 15000ms"
        : err instanceof Error
          ? err.message
          : String(err);
      // Unlike stage 1 we DO retry a timeout here: the call is cheap and short,
      // and a lost decision costs a paired observation.
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      return { ...base, latencyMs: Date.now() - startMs, error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ...base, error: lastError };
}

export { SYSTEM_PROMPT, DECISION_SYSTEM_PROMPT };
