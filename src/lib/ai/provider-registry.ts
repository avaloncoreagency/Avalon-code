// Future AI engine registry (receptionist / chatbots). NOTHING here connects to a provider, spends money or reads a secret.
// Activation needs, ALL at once: (1) server env AVALON_AI_ENABLED === "true", (2) a reviewed adapter factory registered in code,
// (3) the per-project switch enabled, (4) a configured monthly budget not yet exhausted, (5) the global kill switch off.
// Credentials are referenced by ENV VAR NAME only and must be server-side (never NEXT_PUBLIC_*). With the current code no factory
// is registered, so every resolution returns { adapter: null, reason }.
import type { AiAdapter } from "@/lib/os/integrations";

export type ProviderKey = "llm";
export type ProviderSpec = { key: ProviderKey; label: string; secretEnv: string; status: "not_connected"; defaultLimits: { monthlyBudgetUsd: number; maxOutputTokens: number; perMinute: number } };
/** Declared, not connected. `secretEnv` is a variable NAME for the future server-side secret. */
export const PROVIDERS: readonly ProviderSpec[] = [
  { key: "llm", label: "Motor de lenguaje (proveedor por definir)", secretEnv: "AVALON_AI_API_KEY", status: "not_connected", defaultLimits: { monthlyBudgetUsd: 0, maxOutputTokens: 512, perMinute: 6 } },
];

export type ProjectAiConfig = { enabled: boolean; provider: string; monthlyBudgetUsd: number; spentUsd: number };
export type ResolveReason = "ok" | "global_disabled" | "kill_switch" | "project_disabled" | "no_adapter_registered" | "budget_not_set" | "budget_exhausted" | "unknown_provider" | "secret_in_public_env";
export type Resolution = { adapter: AiAdapter | null; reason: ResolveReason };

type Factory = () => AiAdapter;
const factories = new Map<string, Factory>();
/** Only reviewed code may register a factory (none is registered today). Exposed for isolated tests. */
export function registerAdapterFactory(key: ProviderKey, factory: Factory) { factories.set(key, factory); }
export function clearAdapterFactories() { factories.clear(); }

export function resolveAiAdapter(config: ProjectAiConfig, env: Record<string, string | undefined> = process.env, killSwitch = false): Resolution {
  const spec = PROVIDERS.find(p => p.key === config.provider);
  if (!spec) return { adapter: null, reason: "unknown_provider" };
  if (Object.keys(env).some(k => k.startsWith("NEXT_PUBLIC_") && /AI_API_KEY|SECRET/i.test(k) && env[k])) return { adapter: null, reason: "secret_in_public_env" };
  if (killSwitch) return { adapter: null, reason: "kill_switch" };
  if (env.AVALON_AI_ENABLED !== "true") return { adapter: null, reason: "global_disabled" };
  if (!config.enabled) return { adapter: null, reason: "project_disabled" };
  if (!(config.monthlyBudgetUsd > 0)) return { adapter: null, reason: "budget_not_set" };
  if (config.spentUsd >= config.monthlyBudgetUsd) return { adapter: null, reason: "budget_exhausted" };
  const factory = factories.get(config.provider);
  if (!factory) return { adapter: null, reason: "no_adapter_registered" };
  return { adapter: factory(), reason: "ok" };
}

/** Planned (not executed) path: conversation → lead → CRM → calendar → human owner. Every step requires a human to accept. */
export const FUTURE_FLOW = ["authorized_conversation", "lead", "crm", "calendar", "human_owner"] as const;
