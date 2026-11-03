import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { SharedCalendar } from "@/components/crm/shared-calendar";
import { CrmNavigation } from "@/components/crm/navigation";
import { isCalendarDay, moveDay, moveMonth, type CalendarEvent, type DayBanner, type CalendarView } from "@/lib/crm/shared-calendar";
import { OpsLinks, Tag, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Item = { key: string; at: string; kind: "task" | "delivery" | "followup"; title: string; href: string; owner: string | null; status: string; overdue: boolean };

/**
 * Calendario: Samuel's event calendar (meetings, calls, follow-ups in crm_events)
 * plus a read-only operations agenda built from persisted due dates — tasks,
 * work-order deliveries and lead follow-ups. Nothing is synthesized.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const requestedDate = q(p, "date") || "";
  const focusDate = isCalendarDay(requestedDate) ? requestedDate : new Date().toISOString().slice(0, 10);
  const viewParam = q(p, "view");
  const calendarView: CalendarView = viewParam === "week" || viewParam === "day" ? viewParam : "month";
  // A complete month grid plus next/previous weeks, padded for timezone offsets.
  const rangeFrom = moveDay(moveMonth(focusDate, -1), -7);
  const rangeTo = moveDay(moveMonth(focusDate, 2), 7);
  const who = q(p, "owner") === "all" ? null : UUID_RE.test(q(p, "owner") ?? "") ? q(p, "owner")! : userId;
  const days = q(p, "days") === "60" ? 60 : 30;
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 86400000).toISOString();
  const to = new Date(now.getTime() + days * 86400000).toISOString();
  let tasks = supabase.from("crm_tasks").select("id,title,due_at,status,assignee_id").not("status", "in", "(done,cancelled)").gte("due_at", from).lte("due_at", to);
  let orders = supabase.from("crm_work_orders").select("id,sale_id,due_on,status,assignee_id,crm_departments(label),crm_clients(legal_name)").not("status", "in", "(delivered,cancelled)").gte("due_on", from.slice(0, 10)).lte("due_on", to.slice(0, 10));
  let leads = supabase.from("crm_leads").select("id,company,follow_up_at,owner_id").eq("archived", false).gte("follow_up_at", from).lte("follow_up_at", to);
  if (who) { tasks = tasks.eq("assignee_id", who); orders = orders.eq("assignee_id", who); leads = leads.eq("owner_id", who); }
  const [t, o, l, owners, calendarEvents, dayBanners, linkedClients, linkedLeads] = await Promise.all([
    run<{ id: string; title: string; due_at: string; status: string; assignee_id: string }[]>(tasks.limit(300)),
    run<{ id: string; sale_id: string; due_on: string; status: string; assignee_id: string; crm_departments: { label: string } | null; crm_clients: { legal_name: string } | null }[]>(orders.limit(200)),
    run<{ id: string; company: string; follow_up_at: string; owner_id: string }[]>(leads.limit(200)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<CalendarEvent[]>(supabase.from("crm_events").select("id,title,owner_id,attendee_ids,starts_at,ends_at,timezone,all_day,kind,status,color,description,location,meeting_url,participants,lead_id,client_id,version,crm_leads(company)").neq("status", "cancelled").lt("starts_at", rangeTo + "T00:00:00Z").gt("ends_at", rangeFrom + "T00:00:00Z").order("starts_at").limit(600)),
    run<DayBanner[]>(supabase.from("crm_calendar_banners").select("id,day,title,subtitle,emoji,theme,version").gte("day", rangeFrom).lt("day", rangeTo).order("day").limit(180)),
    run<{ id: string; legal_name: string }[]>(supabase.from("crm_clients").select("id,legal_name").neq("status", "archived").order("legal_name").limit(150)),
    run<{ id: string; company: string }[]>(supabase.from("crm_leads").select("id,company").eq("archived", false).order("created_at", { ascending: false }).limit(150)),
  ]);
  const nowIso = now.toISOString();
  const items: Item[] = [
    ...(t.data ?? []).map(x => ({ key: `t${x.id}`, at: x.due_at, kind: "task" as const, title: x.title, href: `/admin/workspace/crm/tasks?task=${x.id}`, owner: x.assignee_id, status: x.status, overdue: x.due_at < nowIso })),
    ...(o.data ?? []).map(x => ({ key: `o${x.id}`, at: `${x.due_on}T17:00:00Z`, kind: "delivery" as const, title: `${x.crm_departments?.label ?? ""} · ${x.crm_clients?.legal_name ?? ""}`, href: `/admin/workspace/crm/sales/${x.sale_id}`, owner: x.assignee_id, status: x.status, overdue: x.due_on < nowIso.slice(0, 10) })),
    ...(l.data ?? []).map(x => ({ key: `l${x.id}`, at: x.follow_up_at, kind: "followup" as const, title: x.company, href: `/admin/workspace/crm/leads?lead=${x.id}`, owner: x.owner_id, status: "open", overdue: x.follow_up_at < nowIso })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const byDay = new Map<string, Item[]>();
  for (const item of items) byDay.set(item.at.slice(0, 10), [...(byDay.get(item.at.slice(0, 10)) ?? []), item]);
  const KIND: Record<Item["kind"], [string, string]> = { task: ["Tarea", "Task"], delivery: ["Entrega", "Delivery"], followup: ["Seguimiento", "Follow-up"] };
  const failed = t.error ?? o.error;
  const link = (params: Record<string, string>) => `?${new URLSearchParams({ ...(who === null ? { owner: "all" } : who !== userId ? { owner: who } : {}), ...(days === 60 ? { days: "60" } : {}), ...params })}`;
  return (
    <Suite active="crm">
      <CrmNavigation active="calendar" />
      <SharedCalendar events={calendarEvents.data ?? []} banners={dayBanners.data ?? []}
        owners={owners.data ?? []} clients={linkedClients.data ?? []} leads={linkedLeads.data ?? []}
        userId={userId} initialDate={focusDate} initialView={calendarView} lang={lang}
        dataError={calendarEvents.error || dayBanners.error ? pick(lang,
          "El calendario compartido requiere la migración de base de datos de este módulo. Los registros operativos siguen disponibles abajo.",
          "The shared calendar needs its database migration. Operations due dates remain below.") : undefined} />
      <details style={{ marginTop: 18 }}><summary style={{ cursor: "pointer", padding: "12px 4px", fontWeight: 700 }}>
        {pick(lang, "📋 Mostrar vencimientos, entregas y seguimientos del CRM", "📋 Show CRM due dates, deliveries and follow-ups")}
      </summary>
      <section className={s.hud} aria-labelledby="agenda" style={{ marginTop: 18 }}>
        <header className={s.header}>
          <div><p className={s.eyebrow}>{pick(lang, "Calendario operativo", "Operations calendar")}</p><h2 id="agenda" style={{ margin: "6px 0" }}>{pick(lang, "Vencimientos, entregas y seguimientos", "Due dates, deliveries and follow-ups")}</h2>
            <p className={s.lead}>{pick(lang, "Fechas guardadas en tareas, órdenes de trabajo y leads. Horas mostradas en tu zona horaria del navegador.", "Dates stored on tasks, work orders and leads.")}</p></div>
          <div className={s.actions}>
            <Link className={s.button} href={link({ owner: userId })} aria-current={who === userId ? "page" : undefined}>{pick(lang, "Mío", "Mine")}</Link>
            <Link className={s.button} href={link({ owner: "all" })} aria-current={who === null ? "page" : undefined}>{pick(lang, "Todos", "Everyone")}</Link>
            {(owners.data ?? []).filter(x => x.user_id !== userId).map(x => <Link key={x.user_id} className={s.button} href={link({ owner: x.user_id })} aria-current={who === x.user_id ? "page" : undefined}>{x.email.split("@")[0]}</Link>)}
            <Link className={`${s.button} ${s.ghost}`} href={link({ days: days === 30 ? "60" : "30" })}>{days === 30 ? pick(lang, "Ver 60 días", "Show 60 days") : pick(lang, "Ver 30 días", "Show 30 days")}</Link>
          </div>
        </header>
        <OpsLinks lang={lang} />
        {failed ? <p className={s.flash} data-tone="warn" role="status">{pick(lang, "La migración de ventas no está aplicada en este entorno: solo se muestran seguimientos de leads.", "The sales migration is not applied here: only lead follow-ups are shown.")}</p> : null}
        {byDay.size === 0 ? <p className={s.empty}>{pick(lang, "Sin fechas en este periodo.", "No dates in this period.")}</p> :
          <div className={s.grid}>{[...byDay.entries()].map(([day, list]) => <section key={day} className={s.card} aria-label={formatDate(lang, day)}>
            <h3>{formatDate(lang, day)}</h3>
            <ul className={s.list}>{list.map(i => <li key={i.key} className={s.notice} data-severity={i.overdue ? "urgent" : "normal"}>
              <span className={s.inline}><span className={s.tag} data-tone={i.kind === "delivery" ? "info" : i.kind === "followup" ? "warn" : "neutral"}>{pick(lang, ...KIND[i.kind])}</span>{i.status !== "open" && <Tag lang={lang} value={i.status} />}{i.overdue && <span className={s.tag} data-tone="danger">{pick(lang, "Vencido", "Overdue")}</span>}</span>
              <Link href={i.href}>{i.title}</Link>
              <small className={s.muted}>{ownerName(owners.data ?? [], i.owner)}{i.kind !== "delivery" ? ` · ${formatDate(lang, i.at, true)}` : ""}</small>
            </li>)}</ul>
          </section>)}</div>}
      </section></details>
    </Suite>
  );
}
