import { readFileSync } from "node:fs";
const env = {};
for (const line of readFileSync("./.env.local", "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }

const CANDIDATES = [
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v3.2",
  "qwen/qwen3.5-flash-02-23",
  "qwen/qwen3-235b-a22b-2507",
  "openai/gpt-oss-120b",
  "google/gemini-3-flash-preview",
  "moonshotai/kimi-k2.5",
  "z-ai/glm-4-32b",
  "mistralai/mistral-small-3.2-24b-instruct",
  "google/gemma-4-26b-a4b-it",
  "bytedance-seed/seed-1.6-flash",
  "meta-llama/llama-4-scout",
];

const SCHEMA = {
  name: "forecast",
  strict: true,
  schema: {
    type: "object",
    properties: {
      probability_yes: { type: "number" },
      reasoning: { type: "string" },
      key_factors: { type: "array", items: { type: "string" } },
    },
    required: ["probability_yes", "reasoning", "key_factors"],
    additionalProperties: false,
  },
};

const SYSTEM = "You are a professional forecaster. Estimate the probability that the event resolves YES. Use web search to find current facts. Respond ONLY with JSON.";
const USER = `Event: "Will the US Federal Reserve cut its policy rate at its next scheduled meeting?"\nResolution: YES if a cut is announced at the next FOMC meeting.\nResearch current expectations, then give probability_yes in [0,1], a short reasoning, and key_factors.`;

async function test(model, webPlugin) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  const start = Date.now();
  try {
    const body = {
      model,
      temperature: 0,
      max_tokens: 2000,
      usage: { include: true },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: USER }],
      response_format: { type: "json_schema", json_schema: SCHEMA },
    };
    if (webPlugin) body.plugins = [{ id: "web", max_results: 3 }];
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "roster-test" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const ms = Date.now() - start;
    if (!res.ok) {
      const txt = await res.text();
      return { model, web: webPlugin, ok: false, ms, err: `HTTP ${res.status}: ${txt.slice(0, 120)}` };
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message ?? {};
    const content = msg.content ?? "";
    const finish = data.choices?.[0]?.finish_reason;
    const cost = data.usage?.cost ?? data.usage?.total_cost ?? null;
    let prob = null, parseOk = false;
    try { const p = JSON.parse(content); prob = p.probability_yes; parseOk = typeof prob === "number"; }
    catch { /* try to extract */ const m = content.match(/"probability_yes"\s*:\s*([0-9.]+)/); if (m) { prob = +m[1]; parseOk = true; } }
    return { model, web: webPlugin, ok: parseOk, ms, cost, finish, len: content.length, prob };
  } catch (e) {
    return { model, web: webPlugin, ok: false, ms: Date.now() - start, err: String(e).slice(0, 100) };
  } finally { clearTimeout(t); }
}

console.log("Testing", CANDIDATES.length, "models WITH web plugin (parallel)...\n");
const withWeb = await Promise.all(CANDIDATES.map((m) => test(m, true)));
console.table(withWeb.map((r) => ({ model: r.model, ok: r.ok, ms: r.ms, cost: r.cost, prob: r.prob, finish: r.finish, len: r.len, err: r.err })));

// Re-test failures without web plugin to isolate the cause
const failed = withWeb.filter((r) => !r.ok).map((r) => r.model);
if (failed.length) {
  console.log("\nRe-testing failures WITHOUT web plugin...\n");
  const noWeb = await Promise.all(failed.map((m) => test(m, false)));
  console.table(noWeb.map((r) => ({ model: r.model, ok: r.ok, ms: r.ms, prob: r.prob, finish: r.finish, len: r.len, err: r.err })));
}
process.exit(0);
