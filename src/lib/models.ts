export const MODEL_COLORS: Record<string, { primary: string; bg: string; text: string }> = {
  "gemini-3-flash":  { primary: "#4285F4", bg: "bg-blue-500/10",    text: "text-blue-400"    },
  "grok-4.1-fast":   { primary: "#8B5CF6", bg: "bg-violet-500/10",  text: "text-violet-400"  },
  "gpt-5.2-chat":    { primary: "#10A37F", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  "deepseek-v3.2":   { primary: "#FF6B35", bg: "bg-orange-500/10",  text: "text-orange-400"  },
  "kimi-k2.5":       { primary: "#EC4899", bg: "bg-pink-500/10",    text: "text-pink-400"    },
  "qwen-3":          { primary: "#06B6D4", bg: "bg-cyan-500/10",    text: "text-cyan-400"    },
};

export const MODEL_LIST = [
  { id: "gemini-3-flash",  name: "Gemini 3 Flash",  provider: "Google",      emoji: "💎" },
  { id: "grok-4.1-fast",   name: "Grok 4.1 Fast",   provider: "xAI",         emoji: "⚡" },
  { id: "gpt-5.2-chat",    name: "GPT-5.2 Chat",    provider: "OpenAI",      emoji: "🧠" },
  { id: "deepseek-v3.2",   name: "DeepSeek V3.2",   provider: "DeepSeek",    emoji: "🔮" },
  { id: "kimi-k2.5",       name: "Kimi K2.5",        provider: "Moonshot AI", emoji: "🌙" },
  { id: "qwen-3",          name: "Qwen 3",           provider: "Alibaba",     emoji: "🐲" },
] as const;
