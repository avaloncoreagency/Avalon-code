import Link from "next/link";
import { KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL, dayKey, shiftAnchor, timeLabel, viewDays, when, type WorkItem } from "@/lib/staff/work";
import s from "@/components/sales/sales.module.css";
import c from "./work-calendar.module.css";

/** Month / week / day agenda of the items the viewer can read (RLS decides; this only lays them out). */
export function WorkCalendar({ items, view, anchor, tz, basePath, today, names }: {
  items: WorkItem[]; view: "month" | "week" | "day"; anchor: string; tz: string; basePath: string; today: string; names?: Map<string, string>;
}) {
  const days = viewDays(view, anchor);
  const byDay = new Map<string, WorkItem[]>();
  for (const i of items) { const w = when(i); if (!w || i.status === "cancelled") continue; const k = dayKey(w, i.time_zone || tz); byDay.set(k, [...(byDay.get(k) ?? []), i]); }
  for (const list of byDay.values()) list.sort((a, b) => Date.parse(when(a)!) - Date.parse(when(b)!));
  const href = (v: string, a: string) => `${basePath}?view=${v}&d=${a}#calendar`;
  const month = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(anchor + "T12:00:00Z"));
  return <div className={c.wrap} data-view={view}>
    <nav className={c.toolbar} aria-label="Navegación del calendario">
      <Link className={s.button} href={href(view, shiftAnchor(view, anchor, -1))} aria-label="Anterior">←</Link>
      <Link className={s.button} href={href(view, today)}>Hoy</Link>
      <Link className={s.button} href={href(view, shiftAnchor(view, anchor, 1))} aria-label="Siguiente">→</Link>
      <strong className={c.title}>{view === "day" ? new Intl.DateTimeFormat("es", { dateStyle: "full", timeZone: "UTC" }).format(new Date(anchor + "T12:00:00Z")) : month}</strong>
      <span className={c.views}>{(["month", "week", "day"] as const).map(v => <Link key={v} className={s.button} aria-current={v === view ? "page" : undefined} href={href(v, anchor)}>
        {v === "month" ? "Mes" : v === "week" ? "Semana" : "Día"}</Link>)}</span>
    </nav>
    {view !== "day" && <div className={c.weekdays} aria-hidden="true">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <span key={d}>{d}</span>)}</div>}
    <ol className={view === "day" ? c.dayList : c.grid} aria-label="Días">
      {days.map(d => { const list = byDay.get(d) ?? []; const outside = view === "month" && d.slice(0, 7) !== anchor.slice(0, 7); return <li key={d} className={c.day}
        data-today={d === today || undefined} data-outside={outside || undefined} aria-label={d}>
        <Link className={c.date} href={href("day", d)}>{Number(d.slice(8))}</Link>
        <ul className={c.items}>{list.map(i => <li key={i.id} className={c.item} data-status={i.status} data-priority={i.priority} data-origin={i.origin} data-work-item>
          <span className={c.time}>{i.starts_at ? timeLabel(i.starts_at, i.time_zone || tz, "es") : i.due_at ? `vence ${timeLabel(i.due_at, i.time_zone || tz, "es")}` : ""}</span>
          <span className={c.label}>{i.title}</span>
          {view === "day" && <span className={s.muted}>{KIND_LABEL[i.kind][0]} · {PRIORITY_LABEL[i.priority][0]} · {STATUS_LABEL[i.status][0]} · {i.origin === "staff_assigned" ? "Asignada" : "Propia"}{names?.get(i.assignee_id) ? ` · ${names.get(i.assignee_id)}` : ""}{i.instructions ? ` — ${i.instructions}` : ""}</span>}
        </li>)}</ul>
      </li>; })}
    </ol>
  </div>;
}
