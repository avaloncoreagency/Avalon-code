// Avalon AI Engine — provider and model catalog. FREE TIERS ONLY. Nothing here reads a secret value: providers reference
// server-side env var NAMES. A catalog entry is a *candidate*; the router only uses it after the provider's live model list
// confirms it exists (and, for OpenRouter, that its live price is exactly 0).
export type ProviderId = "groq" | "cloudflare" | "openrouter" | "oracle";
export type Capability = "reasoning" | "tools" | "code" | "json" | "fast" | "long_context";

export type ModelSpec = {
  id: string;
  quality: 1 | 2 | 3 | 4 | 5; // relative, for ranking only
  context: number; // tokens
  caps: Capability[];
};

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  /** Server-side env var NAMES. Never NEXT_PUBLIC_*. */
  env: string[];
  baseUrl: string; // OpenAI-compatible root (…/chat/completions, …/models)
  /** "operational" providers can be routed to; "prepared" ones never are until verified. */
  status: "operational" | "prepared";
  /** Conservative caps kept BELOW each provider's free allowance (UTC day). */
  daily: { requests: number; tokens: number; neurons?: number };
  perMinute: number;
  models: ModelSpec[]; // empty = discovered live (OpenRouter `:free` models)
  freeRule: string; // human-readable rule the guard enforces
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  groq: {
    id: "groq", label: "GroqCloud (plan Free)", env: ["GROQ_API_KEY"], baseUrl: "https://api.groq.com/openai/v1", status: "operational",
    daily: { requests: 800, tokens: 400_000 }, perMinute: 25,
    models: [
      { id: "openai/gpt-oss-120b", quality: 5, context: 131072, caps: ["reasoning", "tools", "code", "json", "long_context"] },
      { id: "llama-3.3-70b-versatile", quality: 4, context: 131072, caps: ["tools", "code", "json", "long_context"] },
      { id: "qwen/qwen3-32b", quality: 4, context: 131072, caps: ["reasoning", "tools", "code", "json", "long_context"] },
      { id: "openai/gpt-oss-20b", quality: 3, context: 131072, caps: ["reasoning", "tools", "code", "json", "fast", "long_context"] },
      { id: "llama-3.1-8b-instant", quality: 2, context: 131072, caps: ["tools", "json", "fast", "long_context"] },
    ],
    freeRule: "La cuenta debe permanecer en el plan Free (sin tarjeta); límites diarios propios por debajo de la cuota gratuita.",
  },
  cloudflare: {
    id: "cloudflare", label: "Cloudflare Workers AI (asignación gratuita diaria)", env: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1", status: "operational",
    // Free allocation: 10,000 neurons/day. We stop at 8,000 estimated neurons with a pessimistic per-token rate.
    daily: { requests: 300, tokens: 200_000, neurons: 8_000 }, perMinute: 20,
    models: [
      { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", quality: 4, context: 24000, caps: ["tools", "code", "json"] },
      { id: "@cf/qwen/qwen2.5-coder-32b-instruct", quality: 3, context: 32768, caps: ["code", "json"] },
      { id: "@cf/openai/gpt-oss-20b", quality: 3, context: 128000, caps: ["reasoning", "code", "json", "long_context"] },
      { id: "@cf/meta/llama-3.1-8b-instruct-fast", quality: 2, context: 8192, caps: ["fast", "json"] },
    ],
    freeRule: "Tope propio de 8.000 neuronas/día estimadas (asignación gratuita: 10.000). Con plan Free, Cloudflare corta al agotarse; no factura.",
  },
  openrouter: {
    id: "openrouter", label: "OpenRouter (solo modelos :free)", env: ["OPENROUTER_API_KEY"], baseUrl: "https://openrouter.ai/api/v1", status: "operational",
    daily: { requests: 45, tokens: 300_000 }, perMinute: 15, // free variants: 50 req/day without purchased credits
    models: [],
    freeRule: "Solo ids terminados en ':free' cuyo precio en vivo es 0; max_price=0 en cada solicitud; usage.cost > 0 bloquea el proveedor.",
  },
  oracle: {
    id: "oracle", label: "Oracle Cloud Always Free + modelo local (preparado, no operativo)", env: ["ORACLE_AI_BASE_URL", "ORACLE_AI_VERIFIED"],
    baseUrl: "{ORACLE_AI_BASE_URL}", status: "prepared",
    daily: { requests: 500, tokens: 500_000 }, perMinute: 10, models: [],
    freeRule: "No se enruta hasta verificar una instancia Always Free y un modelo local (ORACLE_AI_VERIFIED=true tras la prueba de humo).",
  },
};

/** Neurons estimate for Cloudflare (pessimistic: highest published text-generation rates). */
export const CF_NEURONS_PER_M = { input: 30_000, output: 210_000 };
export const estimateNeurons = (inTok: number, outTok: number) =>
  Math.ceil((inTok * CF_NEURONS_PER_M.input + outTok * CF_NEURONS_PER_M.output) / 1_000_000);

/** Infer capabilities for an OpenRouter free model from its live metadata. */
export function inferOpenRouterModel(m: { id: string; context_length?: number; supported_parameters?: string[] }): ModelSpec {
  const p = m.supported_parameters ?? [];
  const caps: Capability[] = ["json"];
  if (p.includes("tools")) caps.push("tools");
  if (p.includes("reasoning") || p.includes("include_reasoning")) caps.push("reasoning");
  if (/coder|code|devstral|qwen/i.test(m.id)) caps.push("code");
  const ctx = m.context_length ?? 8192;
  if (ctx >= 100_000) caps.push("long_context");
  const size = Number(/(\d{2,3})b/i.exec(m.id)?.[1] ?? 0);
  const quality = (size >= 200 || /deepseek-r1|deepseek-chat-v3|kimi-k2|gpt-oss-120b/i.test(m.id) ? 5 : size >= 60 ? 4 : size >= 24 ? 3 : 2) as ModelSpec["quality"];
  return { id: m.id, quality, context: ctx, caps };
}
