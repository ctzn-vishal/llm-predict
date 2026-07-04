import type { ForecasterKind } from "@/lib/schemas";

export interface ForecasterMeta {
  id: string;
  name: string;
  provider: string;
  emoji: string;
  color: string;
  kind: ForecasterKind;
  region?: string; // for the diversity story (independent errors)
  costIn?: number; // $/1M input tokens
  costOut?: number; // $/1M output tokens
}

// The 6 live models, in a stable display order, plus the two synthetic
// forecasters. `crowd` is the baseline (the Polymarket price); `ensemble` is
// the mean of the 6 model probabilities.
export const FORECASTERS: ForecasterMeta[] = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "DeepSeek", emoji: "🔮", color: "#FF6B35", kind: "model", region: "CN", costIn: 0.10, costOut: 0.20 },
  { id: "qwen3-235b", name: "Qwen3 235B", provider: "Alibaba", emoji: "🐲", color: "#06B6D4", kind: "model", region: "CN", costIn: 0.071, costOut: 0.10 },
  { id: "seed-1.6-flash", name: "Seed 1.6 Flash", provider: "ByteDance", emoji: "🌱", color: "#EC4899", kind: "model", region: "CN", costIn: 0.075, costOut: 0.30 },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "OpenAI", emoji: "🧠", color: "#10A37F", kind: "model", region: "US", costIn: 0.40, costOut: 1.60 },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", provider: "Google", emoji: "💎", color: "#4285F4", kind: "model", region: "US", costIn: 0.25, costOut: 1.50 },
  { id: "mistral-small-3.2", name: "Mistral Small 3.2", provider: "Mistral", emoji: "🌀", color: "#8B5CF6", kind: "model", region: "EU", costIn: 0.075, costOut: 0.20 },
  { id: "ensemble", name: "Ensemble", provider: "Aggregate", emoji: "🎯", color: "#F59E0B", kind: "ensemble" },
  // Market × Models: NOT blind -- anchors on the market price (w=0.8) and nudges
  // it with the model consensus in logit space. The live test of whether cheap
  // LLMs add information the market hasn't priced in. See lib/aggregators.ts.
  { id: "hybrid", name: "Market × Models", provider: "Aggregate", emoji: "⚡", color: "#F43F5E", kind: "ensemble" },
  { id: "crowd", name: "The Crowd", provider: "Polymarket", emoji: "👥", color: "#94A3B8", kind: "crowd" },
];

// Just the 6 LLMs (no ensemble/crowd).
export const MODELS_ONLY = FORECASTERS.filter((f) => f.kind === "model");

export const FORECASTER_BY_ID: Record<string, ForecasterMeta> = Object.fromEntries(
  FORECASTERS.map((f) => [f.id, f]),
);

export function forecasterMeta(id: string): ForecasterMeta {
  return (
    FORECASTER_BY_ID[id] ?? {
      id,
      name: id,
      provider: "Unknown",
      emoji: "🤖",
      color: "#64748B",
      kind: "model",
    }
  );
}

// Tailwind-friendly color tokens, keyed by forecaster id.
export const MODEL_COLORS: Record<string, { primary: string; bg: string; text: string }> = {
  "deepseek-v4-flash": { primary: "#FF6B35", bg: "bg-orange-500/10", text: "text-orange-400" },
  "qwen3-235b": { primary: "#06B6D4", bg: "bg-cyan-500/10", text: "text-cyan-400" },
  "seed-1.6-flash": { primary: "#EC4899", bg: "bg-pink-500/10", text: "text-pink-400" },
  "gpt-4.1-mini": { primary: "#10A37F", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "gemini-3.1-flash-lite": { primary: "#4285F4", bg: "bg-blue-500/10", text: "text-blue-400" },
  "mistral-small-3.2": { primary: "#8B5CF6", bg: "bg-violet-500/10", text: "text-violet-400" },
  ensemble: { primary: "#F59E0B", bg: "bg-amber-500/10", text: "text-amber-400" },
  hybrid: { primary: "#F43F5E", bg: "bg-rose-500/10", text: "text-rose-400" },
  crowd: { primary: "#94A3B8", bg: "bg-slate-500/10", text: "text-slate-300" },
};

// Back-compat alias used by some components.
export const MODEL_LIST = FORECASTERS.map((f) => ({
  id: f.id,
  name: f.name,
  provider: f.provider,
  emoji: f.emoji,
}));
