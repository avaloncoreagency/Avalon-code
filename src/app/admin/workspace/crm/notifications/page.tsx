import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Unavailable, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { markRead } from "./actions";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Notice = { id: string; severity: "urgent" | "normal"; category: string; title: string; body: string; link: string; read_at: string | null; created_at: string };
const CATEGORY: Record<string, [string, string]> = { sales: ["Ventas", "Sales"], delivery: ["Entrega", "Delivery"], task: ["Tareas", "Tasks"], pipeline: ["Pipeline", "Pipeline"] };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const all = q(p, "show") === "all";
  // Deterministic, idempotent sweep (overdue tasks, missed follow-ups); no external calls.
  await supabase.rpc("crm_refresh_alerts").then(() => undefined, () => undefined);
  let query = supabase.from("crm_notifications").select("id,severity,category,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(150);
  if (!all) query = query.is("read_at", null);
  const notices = await run<Notice[]>(query);
  const section = (severity: "urgent" | "normal", es: string, en: string) => {
    const list = (notices.data ?? []).filter(n => n.severity === severity);
    return <section className={s.panel} aria-labelledby={`n-${severity}`}><header><h2 id={`n-${severity}`}>{pick(lang, es, en)} <span className={s.tag} data-tone={severity === "urgent" ? "danger" : "info"}>{list.length}</span></h2></header>
      {list.length === 0 ? <p className={s.muted}>{pick(lang, "Nada pendiente.", "Nothing pending.")}</p> : <ul className={s.list}>{list.map(n => <li key={n.id} className={s.notice} data-severity={n.severity} data-read={Boolean(n.read_at)}>
        <div className={s.actions} style={{ justifyContent: "space-between" }}><strong>{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</strong><span className={s.tag}>{pick(lang, ...(CATEGORY[n.category] ?? [n.category, n.category]))}</span></div>
        {n.body && <span className={s.muted}>{n.body}</span>}
        <div className={s.actions} style={{ justifyContent: "space-between" }}><small className={s.muted}>{formatDate(lang, n.created_at, true)}</small>
          {!n.read_at && <form action={markRead}><input type="hidden" name="id" value={n.id} /><button className={`${s.button} ${s.ghost}`}>{pick(lang, "Marcar leído", "Mark read")}</button></form>}</div>
      </li>)}</ul>}
    </section>;
  };
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="notifications" eyebrow="CRM / Avisos" title={pick(lang, "Avisos comerciales y operativos", "Commercial and operational notices")}
      lead={pick(lang, "Buzón del CRM: ventas, entregas, tareas y seguimientos. Los avisos técnicos de Vercel/Supabase no se mezclan aquí.", "CRM inbox: sales, delivery, tasks and follow-ups. Vercel/Supabase technical notices are not mixed in here.")}
      actions={<><Link className={s.button} href={all ? "?" : "?show=all"}>{all ? pick(lang, "Solo no leídos", "Unread only") : pick(lang, "Ver todos", "Show all")}</Link><form action={markRead}><button className={s.button}>{pick(lang, "Marcar todo como leído", "Mark all read")}</button></form></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {notices.error ? <Unavailable lang={lang} code={notices.error} /> : <div className={s.columns}>{section("urgent", "Urgentes", "Urgent")}{section("normal", "Normales", "Normal")}</div>}
  </div></Suite>;
}
