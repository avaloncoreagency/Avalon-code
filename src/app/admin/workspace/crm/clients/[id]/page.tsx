import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run, type ProjectRow, PROJECT_COLUMNS } from "@/lib/os/data";
import { SERVICES, isService } from "@/lib/os/client-hud";
import { label, money } from "@/lib/sales/domain";
import { addClientActivity, addContact, updateClient, updateClientNotes } from "../actions";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Client = { id: string; client_code: string; legal_name: string; trade_name: string; website: string; industry: string; country: string; location: string; source: string; notes: string; owner_id: string; origin_lead_id: string | null; status: string; created_at: string; version: number };
type Contact = { id: string; full_name: string; email: string | null; phone: string; role: string; is_primary: boolean };
type Sale = { id: string; sale_number: string; sold_on: string; currency: string; total: string; recurring_monthly: string; contract_status: string; delivery_status: string; crm_payments: { amount: string }[]; crm_sale_lines: { id: string }[] };
type Order = { id: string; sale_id: string; department_id: string; project_id: string | null; status: string; due_on: string | null; assignee_id: string; recurrence: string; crm_departments: { label: string } | null };
type Task = { id: string; title: string; status: string; priority: string; due_at: string | null; assignee_id: string; project_id: string | null };
type Event = { id: number; event_type: string; module: string; detail: string; result: string; from_state: string | null; to_state: string | null; actor_id: string | null; created_at: string };
const OPEN = ["todo", "in_progress", "blocked"];

export default async function Client360({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const lang = await getLang();
  const p = await searchParams;
  const client = await run<Client | null>(supabase.from("crm_clients").select("*").eq("id", id).maybeSingle());
  if (!client.error && !client.data) notFound();
  const c = client.data;
  const leadId = c?.origin_lead_id ?? null;
  const [contacts, sales, orders, projects, legacy, tasks, timeline, owners, lead, activities, meetings] = await Promise.all([
    run<Contact[]>(supabase.from("crm_contacts").select("id,full_name,email,phone,role,is_primary").eq("client_id", id).order("is_primary", { ascending: false }).order("full_name")),
    run<Sale[]>(supabase.from("crm_sales").select("id,sale_number,sold_on,currency,total,recurring_monthly,contract_status,delivery_status,crm_payments(amount),crm_sale_lines(id)").eq("client_id", id).order("sold_on", { ascending: false }).limit(100)),
    run<Order[]>(supabase.from("crm_work_orders").select("id,sale_id,department_id,project_id,status,due_on,assignee_id,recurrence,crm_departments(label)").eq("client_id", id).order("created_at").limit(200)),
    run<ProjectRow[]>(supabase.from("os_projects").select(PROJECT_COLUMNS).eq("client_id", id).order("updated_at", { ascending: false }).limit(100)),
    // Compatibility: projects linked earlier through the origin lead id (stable key, never by name).
    leadId ? run<ProjectRow[]>(supabase.from("os_projects").select(PROJECT_COLUMNS).is("client_id", null).eq("settings->operations->>client_lead_id", leadId).limit(100)) : Promise.resolve({ data: [] as ProjectRow[], error: null, count: null }),
    run<Task[]>(supabase.from("crm_tasks").select("id,title,status,priority,due_at,assignee_id,project_id").eq("client_id", id).order("due_at", { ascending: true, nullsFirst: false }).limit(300)),
    run<Event[]>(supabase.from("crm_timeline").select("id,event_type,module,detail,result,from_state,to_state,actor_id,created_at").eq("client_id", id).order("id", { ascending: false }).limit(40)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    leadId ? run<{ id: string; company: string; stage_id: string; value: string; source: string; created_at: string } | null>(supabase.from("crm_leads").select("id,company,stage_id,value,source,created_at").eq("id", leadId).maybeSingle()) : Promise.resolve(null),
    // Activities on the client (FK) and, for history, on its origin lead.
    run<{ id: string; body: string; status: string; kind?: string; due_at: string | null; created_by: string; created_at: string }[]>(supabase.from("crm_activities").select("id,body,status,kind,due_at,created_by,created_at").or(leadId ? `client_id.eq.${id},lead_id.eq.${leadId}` : `client_id.eq.${id}`).order("created_at", { ascending: false }).limit(25)),
    leadId ? run<{ id: string; title: string; starts_at: string; kind: string; status: string }[]>(supabase.from("crm_events").select("id,title,starts_at,kind,status").eq("lead_id", leadId).order("starts_at", { ascending: false }).limit(10)) : Promise.resolve(null),
  ]);
  const ownerList = owners.data ?? [];
  const now = new Date().toISOString();
  const allProjects = [...(projects.data ?? []), ...(legacy.data ?? [])];
  const byCurrency = new Map<string, { contracted: number; collected: number; recurring: number }>();
  for (const sale of sales.data ?? []) {
    const m = byCurrency.get(sale.currency) ?? { contracted: 0, collected: 0, recurring: 0 };
    m.contracted += Number(sale.total); m.recurring += Number(sale.recurring_monthly);
    m.collected += sale.crm_payments.reduce((x, y) => x + Number(y.amount), 0);
    byCurrency.set(sale.currency, m);
  }
  const openTasks = (tasks.data ?? []).filter(t => OPEN.includes(t.status));
  const alerts = [
    ...openTasks.filter(t => t.due_at && t.due_at < now).map(t => ({ key: `o-${t.id}`, text: `${pick(lang, "Vencida", "Overdue")}: ${t.title}`, href: `/admin/workspace/crm/tasks?task=${t.id}` })),
    ...openTasks.filter(t => t.status === "blocked").map(t => ({ key: `b-${t.id}`, text: `${pick(lang, "Bloqueada", "Blocked")}: ${t.title}`, href: `/admin/workspace/crm/tasks?task=${t.id}` })),
    ...(orders.data ?? []).filter(o => o.status === "blocked").map(o => ({ key: `w-${o.id}`, text: `${pick(lang, "Orden bloqueada", "Blocked order")}: ${o.crm_departments?.label}`, href: `/admin/workspace/crm/sales/${o.sale_id}` })),
  ];
  const nextSteps = openTasks.filter(t => !t.due_at || t.due_at >= now).slice(0, 6);

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="clients" eyebrow={`CRM / Clientes / ${c?.client_code ?? ""}`} title={c?.legal_name ?? pick(lang, "Cliente", "Client")}
      lead={c ? [c.trade_name, c.industry, [c.location, c.country].filter(Boolean).join(", "), `${pick(lang, "Fuente", "Source")}: ${c.source}`].filter(Boolean).join(" · ") : undefined}
      actions={c && <><Link className={`${s.button} ${s.primary}`} href={`/admin/workspace/crm/sales/new?client=${c.id}`}>{pick(lang, "+ Nueva venta", "+ New sale")}</Link><Link className={s.button} href={`/admin/workspace/crm/tasks?view=all&client=${c.id}`}>{pick(lang, "Tareas", "Tasks")}</Link><Link className={s.button} href={`/admin/workspace/crm/activity?client=${c.id}`}>{pick(lang, "Actividad", "Activity")}</Link></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {client.error ? <Unavailable lang={lang} code={client.error} /> : c && <>
      <section className={s.stats} aria-label={pick(lang, "Resumen del cliente", "Client summary")}>
        {[...byCurrency.entries()].map(([cur, m]) => <div key={cur} className={s.stat}><span>{pick(lang, "Contratado", "Contracted")} · {cur}</span><strong>{money(lang, m.contracted, cur)}</strong><small>{pick(lang, "Cobrado", "Collected")} {money(lang, m.collected, cur)} · {pick(lang, "Recurrente/mes", "Recurring/mo")} {money(lang, m.recurring, cur)}</small></div>)}
        <div className={s.stat}><span>{pick(lang, "Proyectos activos", "Active projects")}</span><strong>{allProjects.filter(x => x.status === "active").length}</strong><small>{allProjects.length} {pick(lang, "en total", "total")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Tareas abiertas", "Open tasks")}</span><strong>{openTasks.length}</strong><small>{(tasks.data ?? []).filter(t => t.status === "done").length} {pick(lang, "hechas", "done")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Alertas", "Alerts")}</span><strong>{alerts.length}</strong><small>{pick(lang, "Responsable", "Owner")}: {ownerName(ownerList, c.owner_id)}</small></div>
      </section>

      {alerts.length > 0 && <section className={s.panel} aria-labelledby="alerts"><h2 id="alerts">{pick(lang, "Alertas", "Alerts")}</h2><ul className={s.list}>{alerts.map(a => <li key={a.key} className={s.notice} data-severity="urgent"><Link href={a.href}>{a.text}</Link></li>)}</ul></section>}

      <section className={s.panel} aria-labelledby="projects"><header><h2 id="projects">{pick(lang, "Proyectos por departamento", "Projects by department")}</h2></header>
        {projects.error ? <Unavailable lang={lang} code={projects.error} /> : allProjects.length === 0 ? <p className={s.empty}>{pick(lang, "Sin proyectos. Se crean al confirmar una venta.", "No projects. They are created when a sale is confirmed.")}</p> :
        <div className={s.grid}>{allProjects.map(pr => { const svc = isService(pr.module) ? SERVICES[pr.module] : null; const wo = (orders.data ?? []).find(o => o.project_id === pr.id); const pt = (tasks.data ?? []).filter(t => t.project_id === pr.id);
          return <div key={pr.id} className={s.card}><span className={s.eyebrow}>{svc?.name ?? pr.module}</span><h3><Link href={`/admin/workspace/products/${pr.id}`}>{pr.name}</Link></h3>
            <p className={s.inline}><Tag lang={lang} value={pr.status} />{wo && <Tag lang={lang} value={wo.status} />}{wo && wo.recurrence !== "none" && <Tag lang={lang} value={wo.recurrence} />}</p>
            <p className={s.muted}>{pt.length ? `${pt.filter(t => t.status === "done").length}/${pt.filter(t => t.status !== "cancelled").length} ${pick(lang, "tareas hechas", "tasks done")}` : pick(lang, "Sin tareas vinculadas", "No linked tasks")}{wo?.due_on ? ` · ${pick(lang, "entrega", "due")} ${formatDate(lang, wo.due_on)}` : ""}{wo ? ` · ${ownerName(ownerList, wo.assignee_id)}` : ""}</p>
            <p className={s.actions}><Link href={`/admin/workspace/products/${pr.id}`}>{pick(lang, "HUD del producto (entregables, cambios, QA)", "Product HUD (deliverables, changes, QA)")}</Link>{svc && <Link href={`/admin/workspace/${svc.slug}/${pr.id}`}>{pick(lang, "Abrir en", "Open in")} {svc.name}</Link>}</p>
          </div>; })}</div>}
      </section>

      <div className={s.columns}>
        <section className={s.panel} aria-labelledby="sales"><header><h2 id="sales">{pick(lang, "Ventas y servicios", "Sales and services")}</h2></header>
          {sales.error ? <Unavailable lang={lang} code={sales.error} /> : (sales.data ?? []).length === 0 ? <p className={s.muted}>{pick(lang, "Sin ventas registradas.", "No sales recorded.")}</p> :
          <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{pick(lang, "Venta", "Sale")}</th><th>{pick(lang, "Fecha", "Date")}</th><th className={s.num}>Total</th><th className={s.num}>{pick(lang, "Cobrado", "Collected")}</th><th>{pick(lang, "Contrato", "Contract")}</th><th>{pick(lang, "Entrega", "Delivery")}</th></tr></thead>
            <tbody>{sales.data!.map(x => <tr key={x.id}><td><Link href={`/admin/workspace/crm/sales/${x.id}`}>{x.sale_number}</Link><br /><span className={s.muted}>{x.crm_sale_lines.length} {pick(lang, "servicio(s)", "service(s)")}</span></td><td>{formatDate(lang, x.sold_on)}</td><td className={s.num}>{money(lang, x.total, x.currency)}</td><td className={s.num}>{money(lang, x.crm_payments.reduce((a, b) => a + Number(b.amount), 0), x.currency)}</td><td><Tag lang={lang} value={x.contract_status} /></td><td><Tag lang={lang} value={x.delivery_status} /></td></tr>)}</tbody></table></div>}
          <h3>{pick(lang, "Próximos pasos", "Next steps")}</h3>
          {nextSteps.length === 0 ? <p className={s.muted}>{pick(lang, "Sin tareas próximas.", "No upcoming tasks.")}</p> : <ul className={s.list}>{nextSteps.map(t => <li key={t.id}><Link href={`/admin/workspace/crm/tasks?task=${t.id}`}>{t.title}</Link><span className={s.muted}>{t.due_at ? formatDate(lang, t.due_at, true) : pick(lang, "sin fecha", "no date")} · {ownerName(ownerList, t.assignee_id)}</span></li>)}</ul>}
        </section>
        <section className={s.panel} aria-labelledby="identity"><h2 id="identity">{pick(lang, "Identidad y contactos", "Identity and contacts")}</h2>
          <dl className={s.detail}>
            <dt>ID</dt><dd>{c.client_code}</dd>
            <dt>Web</dt><dd>{c.website ? <a href={c.website} rel="noopener noreferrer nofollow" target="_blank">{c.website}</a> : "—"}</dd>
            <dt>{pick(lang, "Alta", "Since")}</dt><dd>{formatDate(lang, c.created_at)}</dd>
            <dt>{pick(lang, "Estado", "Status")}</dt><dd><Tag lang={lang} value={c.status} /></dd>
          </dl>
          {contacts.error ? <Unavailable lang={lang} code={contacts.error} /> : <ul className={s.list} style={{ marginTop: 12 }}>{(contacts.data ?? []).map(ct => <li key={ct.id}><strong>{ct.full_name}{ct.is_primary ? ` · ${pick(lang, "principal", "primary")}` : ""}</strong><span className={s.muted}>{[ct.role, ct.email, ct.phone].filter(Boolean).join(" · ") || "—"}</span></li>)}</ul>}
          <details style={{ marginTop: 10 }}><summary>{pick(lang, "Añadir contacto", "Add contact")}</summary>
            <form action={addContact} className={s.form} style={{ marginTop: 10 }}><input type="hidden" name="client_id" value={c.id} />
              <div className={s.row}><label className={s.field}>{pick(lang, "Nombre *", "Name *")}<input name="full_name" required maxLength={160} /></label><label className={s.field}>Email<input name="email" type="email" maxLength={254} /></label></div>
              <div className={s.row}><label className={s.field}>{pick(lang, "Teléfono", "Phone")}<input name="phone" type="tel" maxLength={40} /></label><label className={s.field}>{pick(lang, "Cargo", "Role")}<input name="role" maxLength={120} /></label></div>
              <button className={s.button}>{pick(lang, "Guardar contacto", "Save contact")}</button></form></details>
          <h3>{pick(lang, "Notas", "Notes")}</h3>
          <form action={updateClientNotes} className={s.form}><input type="hidden" name="client_id" value={c.id} /><label className={s.field}><span className={s.srOnly}>{pick(lang, "Notas", "Notes")}</span><textarea name="notes" maxLength={4000} rows={4} defaultValue={c.notes} /></label><button className={s.button}>{pick(lang, "Guardar notas", "Save notes")}</button></form>
          <details style={{ marginTop: 12 }}><summary>{pick(lang, "Editar datos del cliente", "Edit client details")}</summary>
            <form action={updateClient} className={s.form} style={{ marginTop: 10 }}><input type="hidden" name="client_id" value={c.id} /><input type="hidden" name="version" value={c.version} />
              <div className={s.row}><label className={s.field}>{pick(lang, "Nombre de empresa *", "Company name *")}<input name="legal_name" required maxLength={200} defaultValue={c.legal_name} /></label><label className={s.field}>{pick(lang, "Nombre comercial", "Trade name")}<input name="trade_name" maxLength={200} defaultValue={c.trade_name} /></label></div>
              <div className={s.row}><label className={s.field}>Web<input name="website" type="url" maxLength={500} placeholder="https://" defaultValue={c.website} /></label><label className={s.field}>{pick(lang, "Industria", "Industry")}<input name="industry" maxLength={120} defaultValue={c.industry} /></label></div>
              <div className={s.row}><label className={s.field}>{pick(lang, "País", "Country")}<input name="country" maxLength={80} defaultValue={c.country} /></label><label className={s.field}>{pick(lang, "Ubicación", "Location")}<input name="location" maxLength={200} defaultValue={c.location} /></label></div>
              <div className={s.row}><label className={s.field}>{pick(lang, "Fuente *", "Source *")}<input name="source" required maxLength={200} defaultValue={c.source} /></label><label className={s.field}>{pick(lang, "Estado", "Status")}<select name="status" defaultValue={c.status}>{["active", "inactive", "archived"].map(x => <option key={x} value={x}>{label(lang, x)}</option>)}</select></label></div>
              <button className={s.button}>{pick(lang, "Guardar cambios", "Save changes")}</button></form></details>
          {lead?.data && <><h3>{pick(lang, "Lead y oportunidad de origen", "Origin lead and opportunity")}</h3>
            <p className={s.muted}><Link href={`/admin/workspace/crm/leads?lead=${lead.data.id}`}>{lead.data.company}</Link> · {lead.data.stage_id} · {lead.data.source} · {formatDate(lang, lead.data.created_at)}</p>
            {(meetings?.data ?? []).length > 0 && <><h3>{pick(lang, "Reuniones y seguimientos", "Meetings and follow-ups")}</h3><ul className={s.list}>{meetings!.data!.map(m => <li key={m.id}><strong>{m.title}</strong><small className={s.muted}>{formatDate(lang, m.starts_at, true)} · {m.kind} · {m.status}</small></li>)}</ul></>}
          </>}
        </section>
      </div>

      <section className={s.panel} aria-labelledby="activities"><header><h2 id="activities">{pick(lang, "Actividad comercial y seguimientos", "Commercial activity and follow-ups")}</h2></header>
        <div className={s.columns}>
          <div>{activities.error ? <Unavailable lang={lang} code={activities.error} /> : activities.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin actividades registradas.", "No activities recorded.")}</p> :
            <ul className={s.list}>{activities.data.map(a => <li key={a.id} className={s.notice} data-severity={a.status === "pending" && a.due_at && a.due_at < now ? "urgent" : "normal"}>
              <span className={s.inline}>{a.kind && <span className={s.tag}>{a.kind}</span>}<span className={s.tag} data-tone={a.status === "pending" ? "warn" : "ok"}>{a.status === "pending" ? pick(lang, "Seguimiento pendiente", "Follow-up pending") : pick(lang, "Registrada", "Logged")}</span></span>
              <span style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
              <small className={s.muted}>{ownerName(ownerList, a.created_by)} · {formatDate(lang, a.created_at, true)}{a.due_at ? ` · ${pick(lang, "vence", "due")} ${formatDate(lang, a.due_at)}` : ""}</small></li>)}</ul>}</div>
          <form action={addClientActivity} className={s.form}><input type="hidden" name="client_id" value={c.id} />
            <div className={s.row}>
              <label className={s.field}>{pick(lang, "Tipo", "Type")}<select name="kind" defaultValue="note">{[["note", "Nota", "Note"], ["call", "Llamada", "Call"], ["email", "Email", "Email"], ["whatsapp", "WhatsApp", "WhatsApp"], ["meeting", "Reunión", "Meeting"], ["task", "Seguimiento", "Follow-up"]].map(([k, es, en]) => <option key={k} value={k}>{pick(lang, es, en)}</option>)}</select></label>
              <label className={s.field}>{pick(lang, "Fecha de seguimiento (opcional)", "Follow-up date (optional)")}<input name="due_on" type="date" /></label>
            </div>
            <label className={s.field}>{pick(lang, "Detalle *", "Details *")}<textarea name="body" required maxLength={4000} rows={3} /></label>
            <button className={s.button}>{pick(lang, "Registrar actividad", "Log activity")}</button>
          </form>
        </div>
      </section>

      <section className={s.panel} aria-labelledby="history"><header><h2 id="history">{pick(lang, "Historial de actividad", "Activity history")}</h2><Link href={`/admin/workspace/crm/activity?client=${c.id}`}>{pick(lang, "Investigar en el centro de actividad", "Investigate in the activity center")}</Link></header>
        {timeline.error ? <Unavailable lang={lang} code={timeline.error} /> : timeline.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin eventos registrados.", "No recorded events.")}</p> :
        <ol className={s.timeline}>{timeline.data.map(e => <li key={e.id} data-result={e.result}><strong>{e.event_type}</strong> <span className={s.muted}>· {e.module} · {ownerName(ownerList, e.actor_id)} · {formatDate(lang, e.created_at, true)}</span><div className={s.muted}>{[e.from_state && e.to_state ? `${e.from_state} → ${e.to_state}` : e.to_state, e.detail].filter(Boolean).join(" · ")}</div></li>)}</ol>}
      </section>
    </>}
  </div></Suite>;
}
