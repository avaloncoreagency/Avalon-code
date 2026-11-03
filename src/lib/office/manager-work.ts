/**
 * Real, bounded, read-only office work for five manager roles.
 * No LLM, remote worker, timer, scheduled run, write or impersonation.
 * Every result is backed by owner-RLS Supabase exact COUNT queries at request time.
 */
export type ManagerCode = "ren" | "shin" | "haru" | "sora" | "kenji";
export type CountTable = "office_agent_requests" | "crm_tasks" | "agency_memberships" |
  "crm_leads" | "crm_sales" | "crm_prospects" | "crm_work_orders";
export type CountFilter = { column: string; op: "eq" | "lt" | "in"; value: string | readonly string[] };
export type CountSpec = {
  key: string; label: string; table: CountTable; filters: readonly CountFilter[];
};
export type CountReader = (spec: CountSpec) => Promise<number>;
export type ManagerReport = {
  manager: ManagerCode;
  title: string;
  observedAt: string;
  source: "owner_rls_database";
  status: "completed" | "unavailable";
  metrics: { key: string; label: string; count: number }[];
  nextAction: string;
  note: string;
};

type ManagerJob = {
  title: string;
  specs: readonly CountSpec[];
  next: (numbers: Readonly<Record<string, number>>) => string;
};

const taskOpen = ["todo", "in_progress", "blocked"] as const;
export const MANAGER_JOBS: Record<ManagerCode, ManagerJob> = {
  ren: {
    title: "REN · Cola operativa",
    specs: [
      { key: "pending", label: "Solicitudes de managers pendientes", table: "office_agent_requests", filters: [{ column: "status", op: "eq", value: "registered" }] },
      { key: "blocked", label: "Tareas internas bloqueadas", table: "crm_tasks", filters: [{ column: "status", op: "eq", value: "blocked" }] },
    ],
    next: n => n.blocked ? "Revisar primero las tareas bloqueadas y asignar un responsable." :
      n.pending ? "Clasificar las solicitudes pendientes; todavía necesitan un ejecutor autorizado." :
      "No hay bloqueos ni solicitudes pendientes en los registros consultados.",
  },
  shin: {
    title: "SHIN · Control de acceso",
    specs: [
      { key: "owners", label: "Membresías owner", table: "agency_memberships", filters: [{ column: "role", op: "eq", value: "owner" }] },
      { key: "pending", label: "Solicitudes sin ejecutar", table: "office_agent_requests", filters: [{ column: "status", op: "eq", value: "registered" }] },
    ],
    next: n => n.owners !== 2 ? "Revisar manualmente la cantidad de owners frente al plan de acceso aprobado; no cambiar permisos automáticamente." :
      "Hay dos membresías owner; las identidades, MFA y RLS necesitan pruebas independientes.",
  },
  haru: {
    title: "HARU · Pipeline y ventas",
    specs: [
      { key: "leads", label: "Leads registrados", table: "crm_leads", filters: [] },
      { key: "sales", label: "Ventas registradas", table: "crm_sales", filters: [] },
      { key: "blocked", label: "Tareas CRM bloqueadas", table: "crm_tasks", filters: [{ column: "status", op: "eq", value: "blocked" }] },
    ],
    next: n => n.blocked ? "Priorizar las tareas bloqueadas antes de crear nuevas entregas." :
      n.leads && !n.sales ? "Revisar oportunidades en el pipeline sin asumir que todos los leads están calificados." :
      "Revisar el flujo lead → venta → cliente con los registros existentes; no se creó ninguna venta.",
  },
  sora: {
    title: "SORA · Prospectos del Radar",
    specs: [
      { key: "approved", label: "Prospectos aprobados", table: "crm_prospects", filters: [{ column: "status", op: "eq", value: "approved" }] },
      { key: "converted", label: "Prospectos convertidos", table: "crm_prospects", filters: [{ column: "status", op: "eq", value: "converted" }] },
    ],
    next: n => n.approved ? "Revisar manualmente prospectos aprobados y evidencias; ninguna conversión fue ejecutada." :
      "No hay prospectos pendientes de conversión en el estado aprobado consultado.",
  },
  kenji: {
    title: "KENJI · Riesgos operativos",
    specs: [
      { key: "blockedOrders", label: "Órdenes de trabajo bloqueadas", table: "crm_work_orders", filters: [{ column: "status", op: "eq", value: "blocked" }] },
      { key: "overdueTasks", label: "Tareas vencidas abiertas", table: "crm_tasks", filters: [
        { column: "status", op: "in", value: taskOpen }, { column: "due_at", op: "lt", value: "$NOW" },
      ] },
    ],
    next: n => n.blockedOrders || n.overdueTasks ? "Crear un caso de QA para bloqueos/vencimientos identificados, antes de cambiar lógica de negocio." :
      "No se detectaron bloqueos ni vencimientos con estas consultas; esto no sustituye las pruebas CI.",
  },
};

export function isManagerCode(value: unknown): value is ManagerCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MANAGER_JOBS, value);
}

/** Executes real count queries; any failure invalidates the whole report, not just a metric. */
export async function executeManagerCheck(
  manager: ManagerCode,
  reader: CountReader,
  now: Date = new Date(),
): Promise<ManagerReport> {
  if (!isManagerCode(manager)) throw new Error("invalid_manager");
  if (!Number.isFinite(now.getTime())) throw new Error("invalid_now");
  const job = MANAGER_JOBS[manager];
  const common = {
    manager,
    title: job.title,
    observedAt: now.toISOString(),
    source: "owner_rls_database" as const,
    note: "Ejecución bajo demanda y de solo lectura. No es un agente IA conectado ni prueba actividad horaria autónoma.",
  };
  const numbers: Record<string, number> = {};
  const metrics: ManagerReport["metrics"] = [];
  try {
    for (const spec of job.specs) {
      const actual: CountSpec = {
        ...spec,
        filters: spec.filters.map(f => f.value === "$NOW" ? { ...f, value: now.toISOString() } : f),
      };
      const count = await reader(actual);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("invalid_count");
      numbers[spec.key] = count;
      metrics.push({ key: spec.key, label: spec.label, count });
    }
  } catch {
    return { ...common, status: "unavailable", metrics: [],
      nextAction: "No se pudieron verificar todas las consultas; no mostrar cifras parciales como resultado completo." };
  }
  return { ...common, status: "completed", metrics, nextAction: job.next(numbers) };
}
