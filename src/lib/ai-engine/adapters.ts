// Avalon AI Engine — provider adapters (server-side only). All four speak the OpenAI-compatible chat API.
// `fetch` and `env` are injected so tests run against synthetic servers without network or secrets.
import { PROVIDERS, inferOpenRouterModel, type ModelSpec, type ProviderId } from "./catalog";
import { GuardError, openRouterIsFree } from "./guard";

export type Msg = { role: "system" | "user" | "assistant"; content: string };
export type ChatRequest = { model: string; messages: Msg[]; maxTokens: number; temperature?: number; json?: boolean; timeoutMs?: number };
export type ChatResult = { text: string; model: string; usage: { input: number; output: number }; costUsd: number };
export type ErrorKind = "rate_limited" | "auth" | "unavailable" | "bad_request" | "timeout" | "invalid_response" | "not_configured";

export class ProviderError extends Error {
  constructor(public provider: ProviderId, public kind: ErrorKind, public status = 0, public retryAfterMs = 0) { super(`${provider}:${kind}${status ? ":" + status : ""}`); }
}

type Fetch = typeof fetch;
export type Adapter = {
  id: ProviderId;
  configured: boolean;
  /** Live, free-verified models this account can use right now. */
  listModels(): Promise<ModelSpec[]>;
  chat(req: ChatRequest): Promise<ChatResult>;
};

const retryAfter = (h: Headers) => {
  const v = h.get("retry-after");
  if (!v) return 30_000;
  const s = Number(v);
  return Number.isFinite(s) ? Math.min(s * 1000, 3_600_000) : 30_000;
};

type Wire = {
  choices?: { message?: { content?: unknown } }[]; model?: unknown;
  usage?: { cost?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown };
  data?: { id: string; active?: boolean; context_length?: number; supported_parameters?: string[]; pricing?: Record<string, string>; usage?: unknown; limit?: unknown; is_free_tier?: unknown }[] & Record<string, unknown>;
  result?: { name: string }[];
};

async function call(provider: ProviderId, f: Fetch, url: string, key: string, body: unknown, timeoutMs: number): Promise<Wire> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await f(url, {
      method: body === undefined ? "GET" : "POST", signal: ctl.signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Avalon AI Engine" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ProviderError(provider, (e as Error).name === "AbortError" ? "timeout" : "unavailable");
  } finally { clearTimeout(timer); }
  if (res.status === 429) throw new ProviderError(provider, "rate_limited", 429, retryAfter(res.headers));
  if (res.status === 401 || res.status === 403) throw new ProviderError(provider, "auth", res.status);
  if (res.status === 402) throw new GuardError("payment_required", provider); // never retry into billing
  if (res.status >= 500) throw new ProviderError(provider, "unavailable", res.status);
  if (!res.ok) throw new ProviderError(provider, "bad_request", res.status);
  try { return (await res.json()) as Wire; } catch { throw new ProviderError(provider, "invalid_response", res.status); }
}

function parseChat(provider: ProviderId, j: Wire, model: string): ChatResult {
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new ProviderError(provider, "invalid_response");
  const cost = Number(j?.usage?.cost ?? 0);
  if (!Number.isFinite(cost) || cost > 0) throw new GuardError("cost_reported", `${provider}:${cost}`);
  return { text, model: String(j?.model ?? model), usage: { input: Number(j?.usage?.prompt_tokens ?? 0), output: Number(j?.usage?.completion_tokens ?? 0) }, costUsd: 0 };
}

const openAiBody = (r: ChatRequest) => ({
  model: r.model, messages: r.messages, max_tokens: r.maxTokens, temperature: r.temperature ?? 0.2,
  ...(r.json ? { response_format: { type: "json_object" } } : {}),
});

export function createAdapters(env: Record<string, string | undefined>, f: Fetch = fetch): Record<ProviderId, Adapter> {
  const groqKey = env.GROQ_API_KEY ?? "", orKey = env.OPENROUTER_API_KEY ?? "";
  const cfAcc = env.CLOUDFLARE_ACCOUNT_ID ?? "", cfKey = env.CLOUDFLARE_API_TOKEN ?? "";
  const oracleUrl = env.ORACLE_AI_BASE_URL ?? "";
  const cfBase = PROVIDERS.cloudflare.baseUrl.replace("{account}", encodeURIComponent(cfAcc));
  const need = (p: ProviderId, ok: boolean) => { if (!ok) throw new ProviderError(p, "not_configured"); };

  return {
    groq: {
      id: "groq", configured: !!groqKey,
      async listModels() {
        need("groq", !!groqKey);
        const j = await call("groq", f, `${PROVIDERS.groq.baseUrl}/models`, groqKey, undefined, 15_000);
        const live = new Set<string>((j?.data ?? []).filter(m => m?.active !== false).map(m => m.id));
        return PROVIDERS.groq.models.filter(m => live.has(m.id));
      },
      async chat(r) {
        need("groq", !!groqKey);
        return parseChat("groq", await call("groq", f, `${PROVIDERS.groq.baseUrl}/chat/completions`, groqKey, openAiBody(r), r.timeoutMs ?? 60_000), r.model);
      },
    },
    cloudflare: {
      id: "cloudflare", configured: !!(cfAcc && cfKey),
      async listModels() {
        need("cloudflare", !!(cfAcc && cfKey));
        const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAcc)}/ai/models/search?task=Text%20Generation&per_page=200`;
        const j = await call("cloudflare", f, url, cfKey, undefined, 15_000);
        const live = new Set<string>((j?.result ?? []).map(m => m.name));
        return PROVIDERS.cloudflare.models.filter(m => live.has(m.id));
      },
      async chat(r) {
        need("cloudflare", !!(cfAcc && cfKey));
        return parseChat("cloudflare", await call("cloudflare", f, `${cfBase}/chat/completions`, cfKey, openAiBody(r), r.timeoutMs ?? 60_000), r.model);
      },
    },
    openrouter: {
      id: "openrouter", configured: !!orKey,
      async listModels() {
        need("openrouter", !!orKey);
        const j = await call("openrouter", f, `${PROVIDERS.openrouter.baseUrl}/models`, orKey, undefined, 20_000);
        return (j?.data ?? []).filter(openRouterIsFree).map(inferOpenRouterModel);
      },
      async chat(r) {
        need("openrouter", !!orKey);
        if (!r.model.endsWith(":free")) throw new GuardError("paid_model_refused", r.model);
        // Free endpoints may log prompts: that is why the data guard only lets synthetic / public / aggregated data through.
        const body = { ...openAiBody(r), usage: { include: true }, provider: { max_price: { prompt: 0, completion: 0, request: 0 } } };
        return parseChat("openrouter", await call("openrouter", f, `${PROVIDERS.openrouter.baseUrl}/chat/completions`, orKey, body, r.timeoutMs ?? 90_000), r.model);
      },
    },
    oracle: {
      id: "oracle", configured: !!oracleUrl && env.ORACLE_AI_VERIFIED === "true",
      async listModels() {
        need("oracle", !!oracleUrl && env.ORACLE_AI_VERIFIED === "true");
        const j = await call("oracle", f, `${oracleUrl.replace(/\/$/, "")}/models`, env.ORACLE_AI_API_KEY ?? "local", undefined, 10_000);
        return (j?.data ?? []).map(m => ({ id: String(m.id), quality: 2, context: 8192, caps: ["json"] }) as ModelSpec);
      },
      async chat(r) {
        need("oracle", !!oracleUrl && env.ORACLE_AI_VERIFIED === "true");
        return parseChat("oracle", await call("oracle", f, `${oracleUrl.replace(/\/$/, "")}/chat/completions`, env.ORACLE_AI_API_KEY ?? "local", openAiBody(r), r.timeoutMs ?? 120_000), r.model);
      },
    },
  };
}

/** OpenRouter key status (credits used / limit). Used as $0 evidence before and after a run. */
export async function openRouterKeyStatus(env: Record<string, string | undefined>, f: Fetch = fetch) {
  const j = await call("openrouter", f, `${PROVIDERS.openrouter.baseUrl}/key`, env.OPENROUTER_API_KEY ?? "", undefined, 15_000);
  const d = (j?.data ?? {}) as { usage?: unknown; limit?: unknown; is_free_tier?: unknown };
  return { usage: Number(d.usage ?? 0), limit: d.limit ?? null, isFreeTier: d.is_free_tier ?? null };
}
