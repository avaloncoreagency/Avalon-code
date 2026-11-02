import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Event = { id: number; correlation_id: string | null; event_type: string; module: string; actor_id: string | null; client_id: string | null; sale_id: string | null; project_id: string | null; task_id: string | null; entity: string; from_state: string | null; to_state: string | null; result: string; source: string; detail: string; created_at: string };
const MODULES = ["crm", "sales", "website", "ecommerce", "crm_creator", "receptionist", "marketing", "automation"];
const PAGE = 60;

export default async function ActivityCenter({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const f = {
    from: /^\d{4}-\d{2}-\d{2}$/.test(q(p, "from") ?? "") ? q(p, "from") : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(q(p, "to") ?? "") ? q(p, "to") : undefined,
    actor: UUID_RE.test(q(p, "actor") ?? "") ? q(p, "actor") : undefined,
    client: UUID_RE.test(q(p, "client") ?? "") ? q(p, "client") : undefined,
    sale: UUID_RE.test(q(p, "sale") ?? "") ? q(p, "sale") : undefined,
    project: UUID_RE.test(q(p, "project") ?? "") ? q(p, "project") : undefined,
    correlation: UUID_RE.test(q(p, "correlation") ?? "") ? q(p, "correlation") : undefined,
    module: MODULES.includes(q(p, "module") ?? "") ? q(p, "module") : undefined,
    event: /^[a-z_]+(\.[a-z_]+)?$/.test(q(p, "event") ?? "") ? q(p, "event") : undefined,
    result: ["success", "error", "skipped"].includes(q(p, "result") ?? "") ? q(p, "result") : undefined,
  };
  const before = /^\d{1,18}$/.test(q(p, "before") ?? "") ? q(p, "before") : undefined;
  let query = supabase.from("crm_timeline").select("id,correlation_id,event_type,module,actor_id,client_id,sale_id,project_id,task_id,entity,from_state,to_state,result,source,detail,created_at");
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00Z`);
  if (f.to) query = query.lt("created_at", new Date(Date.parse(`${f.to}T00:00:00Z`) + 86400000).toISOString());
  if (f.actor) query = query.eq("actor_id", f.actor);
  if (f.client) query = query.eq("client_id", f.client);
  if (f.sale) query = query.eq("sale_id", f.sale);
  if (f.project) query = query.eq("project_id", f.project);
  if (f.correlation) query = query.eq("correlation_id", f.correlation);
  if (f.module) query = query.eq("module", f.module);
  if (f.event) query = f.event.includes(".") ? query.eq("event_type", f.event) : query.like("event_type", `${f.event}.%`);
  if (f.result) query = query.eq("result", f.result);
  if (before) query = query.lt("id", before);
  const [events, owners, clients] = await Promise.all([
    run<Event[]>(query.order("id", { ascending: false }).limit(PAGE)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<{ id: string; legal_name: string }[]>(supabase.from("crm_clients").select("id,legal_name").order("legal_name").limit(500)),
  ]);
  const ownerList = owners.data ?? [];
  const clientName = (id: string | null) => (clients.data ?? []).find(c => c.id === id)?.legal_name;
  const keep = Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;
  const last = events.data?.at(-1)?.id;
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="activity" eyebrow="CRM / Auditoría" title={pick(lang, "Centro de actividad", "Activity center")}
      lead={pick(lang, "Historia protegida de cada operación: qué ocurrió, quién, cuándo, desde qué módulo, sobre qué cliente o proyecto y con qué resultado. Solo lectura; nadie puede editarla desde la aplicación.", "Protected history of every operation: what happened, who, when, from which module, on which client or project and with what result. Read-only; nobody can edit it from the app.")} />
    <section className={s.panel} aria-labelledby="filters"><h2 id="filters">{pick(lang, "Filtros", "Filters")}</h2>
      <form className={s.toolbar}>
        <label>{pick(lang, "Desde", "From")}<input type="date" name="from" defaultValue={f.from} /></label>
        <label>{pick(lang, "Hasta", "To")}<input type="date" name="to" defaultValue={f.to} /></label>
        <label>{pick(lang, "Usuario", "User")}<select name="actor" defaultValue={f.actor ?? ""}><option value="">{pick(lang, "Todos", "All")}</option>{ownerList.map(o => <option key={o.user_id} value={o.user_id}>{o.email}</option>)}</select></label>
        <label>{pick(lang, "Cliente", "Client")}<select name="client" defaultValue={f.client ?? ""}><option value="">{pick(lang, "Todos", "All")}</option>{(clients.data ?? []).map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></label>
        <label>{pick(lang, "Departamento / módulo", "Department / module")}<select name="module" defaultValue={f.module ?? ""}><option value="">{pick(lang, "Todos", "All")}</option>{MODULES.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
        <label>{pick(lang, "Evento (ej. sale o task.status_changed)", "Event (e.g. sale or task.status_changed)")}<input name="event" defaultValue={f.event} maxLength={60} pattern="[a-z_]+(\.[a-z_]+)?" /></label>
        <label>{pick(lang, "Resultado", "Result")}<select name="result" defaultValue={f.result ?? ""}><option value="">{pick(lang, "Todos", "All")}</option><option value="success">success</option><option value="error">error</option><option value="skipped">skipped</option></select></label>
        {f.sale && <input type="hidden" name="sale" value={f.sale} />}{f.project && <input type="hidden" name="project" value={f.project} />}{f.correlation && <input type="hidden" name="correlation" value={f.correlation} />}
        <button className={s.button}>{pick(lang, "Aplicar", "Apply")}</button><Link className={`${s.button} ${s.ghost}`} href="/admin/workspace/crm/activity">{pick(lang, "Limpiar", "Reset")}</Link>
      </form>
    </section>
    <section className={s.panel} aria-labelledby="events"><h2 id="events">{pick(lang, "Eventos", "Events")}</h2>
      {events.error ? <Unavailable lang={lang} code={events.error} /> : events.data.length === 0 ? <p className={s.empty}>{pick(lang, "Sin eventos para estos filtros.", "No events for these filters.")}</p> :
      <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{pick(lang, "Cuándo", "When")}</th><th>{pick(lang, "Evento", "Event")}</th><th>{pick(lang, "Quién", "Who")}</th><th>{pick(lang, "Sobre", "On")}</th><th>{pick(lang, "Cambio", "Change")}</th><th>{pick(lang, "Resultado", "Result")}</th></tr></thead>
        <tbody>{events.data.map(e => <tr key={e.id}>
          <td>{formatDate(lang, e.created_at, true)}</td>
          <td><strong>{e.event_type}</strong><br /><span className={s.muted}>{e.module} · {e.source}</span></td>
          <td>{ownerName(ownerList, e.actor_id)}</td>
          <td>{e.client_id && <Link href={`/admin/workspace/crm/clients/${e.client_id}`}>{clientName(e.client_id) ?? pick(lang, "Cliente", "Client")}</Link>}{e.sale_id && <> · <Link href={`/admin/workspace/crm/sales/${e.sale_id}`}>{pick(lang, "venta", "sale")}</Link></>}{e.project_id && <> · <Link href={`/admin/workspace/products/${e.project_id}`}>{pick(lang, "proyecto", "project")}</Link></>}{e.task_id && <> · <Link href={`/admin/workspace/crm/tasks?task=${e.task_id}`}>{pick(lang, "tarea", "task")}</Link></>}{!e.client_id && !e.sale_id && !e.project_id && !e.task_id && <span className={s.muted}>{e.entity}</span>}</td>
          <td>{e.from_state || e.to_state ? `${e.from_state ?? "∅"} → ${e.to_state ?? "∅"}` : ""}<br /><span className={s.muted}>{e.detail}</span>{e.correlation_id && <><br /><Link href={`?correlation=${e.correlation_id}`} className={s.muted}>{pick(lang, "operación", "operation")} {e.correlation_id.slice(0, 8)}</Link></>}</td>
          <td><span className={s.tag} data-tone={e.result === "error" ? "danger" : e.result === "skipped" ? "neutral" : "ok"}>{e.result}</span></td>
        </tr>)}</tbody></table></div>}
      {events.data && events.data.length === PAGE && last && <div className={s.actions} style={{ marginTop: 12 }}><Link className={s.button} href={`?${new URLSearchParams({ ...keep, before: String(last) })}`}>{pick(lang, "Más antiguos", "Older")}</Link></div>}
    </section>
  </div></Suite>;
}
