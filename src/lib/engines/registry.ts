// Avalon engine registry — shared contract for the backend and the Codex frontend.
// Source of truth: table public.crm_engine_registry and view public.crm_engine_status (owners only, RLS).
// A row describes a PLANNED engine and its honestly reported state; it never implies that the engine is installed,
// running or connected. LangGraph, Trivy, Playwright… are frameworks/tools, not AI models.

export const ENGINE_STATES = ["NOT_CONFIGURED", "READY", "RUNNING", "PAUSED", "RATE_LIMITED", "FAILED", "UNAVAILABLE"] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

export const ENGINE_IDS = ["ren", "shin", "haru", "sora", "kenji", "akira", "nova", "lumi", "vega", "echo"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export type EngineRuntime = "library" | "cli_scanner" | "service" | "browser" | "gpu_service" | "agent_platform";
export type ConfigurationStatus = "not_configured" | "configured" | "verified";
export type HealthStatus = "unknown" | "healthy" | "degraded" | "down";
export type QuotaStatus = "unknown" | "ok" | "near_limit" | "exhausted";

/** One row of public.crm_engine_status (registry + effective status after kill switch / seat suspension). */
export type EngineRecord = {
  engine_id: EngineId;
  manager: string;                 // REN, SHIN, …
  name: string;                    // LangGraph, Trivy, …
  responsibility: string;
  capabilities: string[];
  provider: "self_hosted" | "managed" | "external_api" | "unknown";
  runtime_type: EngineRuntime;
  requires_gpu: boolean;
  deployment_status: EngineState;  // as last reported
  configuration_status: ConfigurationStatus;
  health_status: HealthStatus;
  quota_status: QuotaStatus;
  license: string | null;
  license_verified: boolean;
  worker_key: string | null;
  last_execution_id: string | null; // crm_agent_runs.id (durable queue + history)
  last_execution_at: string | null;
  estimated_cost_usd: number | null; // null = unknown, never assumed 0
  error_code: string | null;
  notes: string;
  updated_at: string;
  effective_status: EngineState;   // what the UI must show
  paused_reason: "kill_switch" | "seat_suspended" | null;
};

/** States a person may set from the UI. RUNNING / RATE_LIMITED / FAILED come only from the execution layer. */
export const OPERATOR_STATES: readonly EngineState[] = ["NOT_CONFIGURED", "READY", "PAUSED", "UNAVAILABLE"];

/** Same rule as the SQL constraint: an engine may only be READY/RUNNING with verified configuration and license. */
export function canBeReady(e: Pick<EngineRecord, "configuration_status" | "license_verified">): boolean {
  return e.configuration_status === "verified" && e.license_verified;
}

/** Effective state, mirroring view crm_engine_status (useful for optimistic UI and tests). */
export function effectiveState(e: Pick<EngineRecord, "deployment_status">, killSwitch: boolean, seatSuspended: boolean): EngineState {
  return killSwitch || seatSuspended ? "PAUSED" : e.deployment_status;
}

/** UI copy (ES/EN). Honest: nothing reads as "working" unless the executor reported it. */
export const ENGINE_STATE_LABEL: Record<EngineState, { es: string; en: string; tone: "neutral" | "ok" | "busy" | "warn" | "error" }> = {
  NOT_CONFIGURED: { es: "Sin configurar", en: "Not configured", tone: "neutral" },
  READY: { es: "Listo (verificado)", en: "Ready (verified)", tone: "ok" },
  RUNNING: { es: "Ejecutando", en: "Running", tone: "busy" },
  PAUSED: { es: "En pausa", en: "Paused", tone: "warn" },
  RATE_LIMITED: { es: "Límite de cuota", en: "Rate limited", tone: "warn" },
  FAILED: { es: "Falló", en: "Failed", tone: "error" },
  UNAVAILABLE: { es: "No disponible", en: "Unavailable", tone: "error" },
};
