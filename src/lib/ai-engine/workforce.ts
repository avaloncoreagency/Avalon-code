// Avalon AI Engine — the ten digital-worker profiles. Five managers are active; five seats are reserved for Samuel's
// future team and are INACTIVE: no executors, no AI access, no accounts. Executors reference what really exists:
// SQL capabilities in crm_agent_capabilities (Supabase), the REN dev worker (GitHub Actions) and AI-assisted analysis.
import type { DataClass } from "./guard";
import type { Requirements } from "./router";

export type Executor = {
  id: string;
  kind: "sql" | "github_worker" | "ai_analysis";
  /** read = observes only; write_internal = Avalon-internal rows; branch_pr = own branch + draft PR, never merges. */
  effect: "read" | "write_internal" | "branch_pr";
  ref: string; // capability name / workflow / prompt id
  requiresApproval: boolean;
};
export type Objective = { id: string; text: string; kpi: string };
export type WorkerProfile = {
  key: string; name: string; department: string; status: "active" | "reserved";
  objectives: Objective[]; executors: Executor[];
  ai: { requirements: Requirements; dataClasses: DataClass[] } | null;
};

const sql = (ref: string, effect: Executor["effect"] = "read"): Executor => ({ id: ref, kind: "sql", effect, ref, requiresApproval: false });

export const WORKFORCE: WorkerProfile[] = [
  { key: "ren", name: "REN", department: "Dirección y desarrollo", status: "active",
    objectives: [
      { id: "ren.plan", text: "Plan operativo diario priorizado a partir de los otros cuatro managers", kpi: "misión diaria completada" },
      { id: "ren.dev", text: "Descubrir y resolver tareas de desarrollo de bajo riesgo en rama propia con pruebas", kpi: "PR borrador con CI verde / semana" },
    ],
    executors: [sql("operations_plan"), { id: "ren.dev_task", kind: "github_worker", effect: "branch_pr", ref: ".github/workflows/ai-engine.yml#ren-dev-task", requiresApproval: true }],
    ai: { requirements: { caps: ["code", "json"], minQuality: 3, minContext: 16000 }, dataClasses: ["public_repo", "synthetic"] } },
  { key: "shin", name: "SHIN", department: "Seguridad e infraestructura", status: "active",
    objectives: [{ id: "shin.posture", text: "Revisar la postura de seguridad y señalar regresiones", kpi: "hallazgos abiertos por severidad" }],
    executors: [sql("security_posture"), { id: "shin.explain", kind: "ai_analysis", effect: "read", ref: "security_summary", requiresApproval: false }],
    ai: { requirements: { caps: ["reasoning", "json"], minQuality: 3 }, dataClasses: ["internal_aggregate", "public_repo"] } },
  { key: "haru", name: "HARU", department: "CRM y producto", status: "active",
    objectives: [
      { id: "haru.followups", text: "Ningún seguimiento de lead vencido sin tarea interna", kpi: "seguimientos vencidos sin tarea = 0" },
      { id: "haru.journey", text: "13 etapas, Radar→Lead, calendario y tareas verificados", kpi: "pruebas CRM/calendario/tareas en verde" },
    ],
    executors: [sql("crm_followups"), sql("followup_tasks", "write_internal")],
    ai: { requirements: { caps: ["json"], minQuality: 2, prefer: "speed" }, dataClasses: ["internal_aggregate"] } },
  { key: "sora", name: "SORA", department: "Integraciones (Radar, Geoapify, Higgsfield Bridge)", status: "active",
    objectives: [
      { id: "sora.radar", text: "Cola del Radar revisada: 4–5★ primero, sin contacto automático", kpi: "pendientes 4–5★ sin revisar" },
      { id: "sora.integrations", text: "Radar, Geoapify y Creative Bridge verificados; recursos publicados íntegros (SHA-256)", kpi: "fallos de integridad = 0" },
    ],
    executors: [sql("radar_review_queue"), { id: "sora.integrations_check", kind: "github_worker", effect: "read", ref: "scripts/ai-engine/managers.cjs#sora", requiresApproval: false }],
    ai: { requirements: { caps: ["json"], minQuality: 3 }, dataClasses: ["internal_aggregate"] } },
  { key: "kenji", name: "KENJI", department: "Calidad, pruebas y costos", status: "active",
    objectives: [
      { id: "kenji.quality", text: "Calidad de datos y ejecuciones de managers en 24 h", kpi: "leads sin contacto, fallos 24 h" },
      { id: "kenji.cost", text: "Presupuesto de inferencia en $0", kpi: "coste IA acumulado = 0" },
    ],
    executors: [sql("data_quality_cost"), { id: "kenji.ai_ledger", kind: "ai_analysis", effect: "read", ref: "ai_usage_ledger", requiresApproval: false }],
    ai: { requirements: { caps: ["json"], minQuality: 2, prefer: "speed" }, dataClasses: ["internal_aggregate", "synthetic"] } },
  ...[1, 2, 3, 4, 5].map((n): WorkerProfile => ({
    key: `samuel_${n}`, name: `Puesto ${n + 5}`, department: "Próxima incorporación — Equipo de Samuel", status: "reserved",
    objectives: [], executors: [], ai: null,
  })),
];

export const activeWorkers = () => WORKFORCE.filter(w => w.status === "active");
export const profileOf = (key: string) => WORKFORCE.find(w => w.key === key) ?? null;
