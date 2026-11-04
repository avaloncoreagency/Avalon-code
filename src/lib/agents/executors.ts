// Deterministic read-only executors. Each reads through the caller's own RLS-scoped client and returns a report.
// Reports hold counts and internal ids only (never contact data) and are never published outside the private database.
import type { EvidenceRef, ManagerKey } from "./policy";

type Q = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
type FilterBuilder = Q & {
  eq(c: string, v: unknown): FilterBuilder; lt(c: string, v: unknown): FilterBuilder; gt(c: string, v: unknown): FilterBuilder;
  is(c: string, v: null): FilterBuilder; in(c: string, v: unknown[]): FilterBuilder; order(c: string): FilterBuilder; limit(n: number): FilterBuilder;
};
export type AgentDb = {
  from(table: string): { select(cols: string): FilterBuilder };
  rpc(name: string, args?: Record<string, unknown>): Q;
};
export type Report = { summary: string; result: Record<string, unknown>; evidence: EvidenceRef[] };
const rows = async <T,>(q: Q): Promise<T[]> => { const { data, error } = await q; if (error) throw new Error(error.code ?? "query_failed"); return (data ?? []) as T[]; };
const ref = (type: string, items: { id: string }[], label?: string): EvidenceRef[] => items.slice(0, 5).map(i => ({ type, id: i.id, ...(label ? { label } : {}) }));
const iso = (d: Date) => d.toISOString();

export async function haru(db: AgentDb, now: Date): Promise<Report> {
  const [leads, tasks] = await Promise.all([
    rows<{ id: string; follow_up_at: string }>(db.from("crm_leads").select("id,follow_up_at").eq("archived", false).lt("follow_up_at", iso(now)).order("follow_up_at").limit(200)),
    rows<{ id: string; priority: string }>(db.from("crm_tasks").select("id,priority").in("status", ["todo", "in_progress", "blocked"]).lt("due_at", iso(now)).limit(200)),
  ]);
  const urgent = tasks.filter(t => t.priority === "urgent" || t.priority === "high").length;
  return {
    summary: `${leads.length} seguimientos de leads vencidos y ${tasks.length} tareas atrasadas (${urgent} de prioridad alta/urgente). Sin contacto automático con prospectos.`,
    result: { overdue_follow_ups: leads.length, overdue_tasks: tasks.length, overdue_high_priority_tasks: urgent, oldest_follow_up: leads[0]?.follow_up_at ?? null },
    evidence: [...ref("lead", leads, "seguimiento vencido"), ...ref("task", tasks, "tarea atrasada")].slice(0, 10),
  };
}

export async function sora(db: AgentDb): Promise<Report> {
  const pending = await rows<{ id: string; stars: number | null; stars_override: number | null }>(
    db.from("crm_prospects").select("id,stars,stars_override").eq("status", "pending").limit(500));
  const eff = (p: { stars: number | null; stars_override: number | null }) => p.stars_override ?? p.stars;
  const scored = pending.filter(p => eff(p) !== null).sort((a, b) => (eff(b) ?? 0) - (eff(a) ?? 0));
  const unscored = pending.length - scored.length;
  const top = scored.filter(p => (eff(p) ?? 0) >= 4);
  return {
    summary: pending.length === 0 ? "No hay prospectos pendientes de revisión." :
      `${pending.length} prospectos pendientes: ${top.length} con 4–5 estrellas para revisar primero, ${unscored} sin calificar (no se asume necesidad sin evidencia). Sin compras de créditos ni contacto automático.`,
    result: { pending: pending.length, review_first_4_5_stars: top.length, unscored, by_stars: [1, 2, 3, 4, 5].map(s => scored.filter(p => eff(p) === s).length) },
    evidence: ref("prospect", top, "revisar primero"),
  };
}

export async function kenji(db: AgentDb, now: Date): Promise<Report> {
  const since = iso(new Date(now.getTime() - 24 * 3600_000));
  const [noContact, runs] = await Promise.all([
    rows<{ id: string }>(db.from("crm_leads").select("id").eq("archived", false).is("email", null).eq("phone", "").limit(500)),
    rows<{ status: string }>(db.from("crm_agent_runs").select("status").gt("created_at", since).limit(500)),
  ]);
  const count = (s: string) => runs.filter(r => r.status === s).length;
  const bad = count("failed") + count("blocked");
  return {
    summary: `${noContact.length} leads activos sin email ni teléfono. Últimas 24 h: ${runs.length} ejecuciones de managers (${bad} fallidas o bloqueadas). Todas gratuitas: sin proveedor de pago.`,
    result: { leads_without_contact: noContact.length, runs_24h: runs.length, failed_24h: count("failed"), blocked_24h: count("blocked"), incremental_cost_usd: 0 },
    evidence: ref("lead", noContact, "sin contacto"),
  };
}

export async function shin(db: AgentDb): Promise<Report> {
  const { data, error } = await db.rpc("crm_agent_security_posture");
  if (error) throw new Error(error.code ?? "rpc_failed");
  const p = data as { tables_without_rls: string[]; tables_readable_by_anon: string[]; definer_functions_callable_by_anon: string[]; owner_memberships: number; other_memberships: number; kill_switch: boolean };
  const findings: { severity: string; finding: string }[] = [];
  if (p.tables_without_rls.length) findings.push({ severity: "high", finding: `Tablas públicas sin RLS: ${p.tables_without_rls.join(", ")}` });
  if (p.tables_readable_by_anon.length) findings.push({ severity: "high", finding: `Tablas con privilegios para anon: ${p.tables_readable_by_anon.join(", ")}` });
  // The public quote RPC is the one documented anonymous entry point; anything else is unexpected.
  const unexpected = p.definer_functions_callable_by_anon.filter(f => f !== "crm_public_inquiry");
  if (unexpected.length) findings.push({ severity: "high", finding: `Funciones SECURITY DEFINER ejecutables por anon: ${unexpected.join(", ")}` });
  if (p.kill_switch) findings.push({ severity: "info", finding: "El interruptor de emergencia está activo: no corre ninguna ejecución." });
  return {
    summary: findings.filter(f => f.severity === "high").length
      ? `${findings.filter(f => f.severity === "high").length} hallazgos de seguridad de privilegios a corregir. Revisión del catálogo, no una auditoría completa.`
      : "Sin hallazgos en la revisión del catálogo (RLS, privilegios anon, funciones definer). No equivale a declarar el sistema seguro: faltan pruebas ofensivas autorizadas y revisión de configuración.",
    result: { findings, owners: p.owner_memberships, non_owner_members: p.other_memberships, scope: "catalog_review_only" },
    evidence: [],
  };
}

export async function ren(db: AgentDb, now: Date): Promise<Report> {
  const [blocked, overdue, pending, bad] = await Promise.all([
    rows<{ id: string }>(db.from("crm_tasks").select("id").eq("status", "blocked").limit(200)),
    rows<{ id: string }>(db.from("crm_tasks").select("id").in("status", ["todo", "in_progress"]).lt("due_at", iso(now)).limit(200)),
    rows<{ id: string }>(db.from("crm_prospects").select("id").eq("status", "pending").limit(500)),
    rows<{ id: string; manager_key: string }>(db.from("crm_agent_runs").select("id,manager_key").in("status", ["failed", "blocked"]).gt("created_at", iso(new Date(now.getTime() - 24 * 3600_000))).limit(100)),
  ]);
  const plan = [
    ...(bad.length ? [{ priority: 1, action: `Revisar ${bad.length} ejecuciones de managers fallidas/bloqueadas (24 h)`, owner: "shin/kenji" }] : []),
    ...(blocked.length ? [{ priority: 2, action: `Desbloquear ${blocked.length} tareas bloqueadas`, owner: "ren" }] : []),
    ...(overdue.length ? [{ priority: 3, action: `Resolver ${overdue.length} tareas atrasadas`, owner: "haru" }] : []),
    ...(pending.length ? [{ priority: 4, action: `Revisar ${pending.length} prospectos pendientes del Radar`, owner: "sora" }] : []),
  ];
  return {
    summary: plan.length ? `Plan: ${plan.map(p => p.action).join("; ")}.` : "Sin bloqueos ni atrasos detectados en CRM ni en ejecuciones de managers.",
    result: { plan },
    evidence: [...ref("task", blocked, "bloqueada"), ...ref("task", overdue, "atrasada")].slice(0, 10),
  };
}

export const EXECUTORS: Record<ManagerKey, (db: AgentDb, now: Date) => Promise<Report>> = {
  ren: ren, shin: (db) => shin(db), haru: haru, sora: (db) => sora(db), kenji: kenji,
};
