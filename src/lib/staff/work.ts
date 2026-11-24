/**
 * Staff work calendar helpers (pure). Times are stored as timestamptz; the UI works in the item's IANA time zone so
 * daylight-saving changes never shift an appointment. KPIs are computed ONLY from records the caller can read by RLS.
 */
export type WorkItem = {
  id: string; kind: "task" | "appointment" | "follow_up"; origin: "staff_assigned" | "staff_created";
  assignee_id: string; created_by: string; title: string; instructions: string;
  starts_at: string | null; ends_at: string | null; due_at: string | null; time_zone: string;
  priority: "low" | "normal" | "high" | "urgent"; status: "todo" | "in_progress" | "done" | "cancelled";
  lead_id: string | null; client_id: string | null; assignee_can_reschedule: boolean;
  completion_note: string; completed_at: string | null; version: number; updated_at: string;
};
export const DEFAULT_TZ = "America/New_York";
export const KIND_LABEL: Record<WorkItem["kind"], [string, string]> = { task: ["Tarea", "Task"], appointment: ["Cita", "Appointment"], follow_up: ["Seguimiento", "Follow-up"] };
export const PRIORITY_LABEL: Record<WorkItem["priority"], [string, string]> = { low: ["Baja", "Low"], normal: ["Normal", "Normal"], high: ["Alta", "High"], urgent: ["Urgente", "Urgent"] };
export const STATUS_LABEL: Record<WorkItem["status"], [string, string]> = { todo: ["Pendiente", "To do"], in_progress: ["En curso", "In progress"], done: ["Hecha", "Done"], cancelled: ["Cancelada", "Cancelled"] };
export const isKind = (v: string): v is WorkItem["kind"] => v in KIND_LABEL;
export const isPriority = (v: string): v is WorkItem["priority"] => v in PRIORITY_LABEL;
export const isStatus = (v: string): v is WorkItem["status"] => v in STATUS_LABEL;
export const validTimeZone = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return /^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(tz); } catch { return false; } };

function offsetMs(utcMs: number, tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs)).map(p => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - utcMs;
}
/** "2026-12-10" + "11:30" in tz → ISO UTC. Returns null for invalid input. DST-safe (two-pass offset). */
export function localToUtc(date: string, time: string, tz: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{2}):(\d{2})$/.exec(time || "00:00");
  if (!d || !t || !validTimeZone(tz)) return null;
  const naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const back = new Date(naive);
  if (Number.isNaN(naive) || +t[1] > 23 || +t[2] > 59 || back.getUTCMonth() !== +d[2] - 1 || back.getUTCDate() !== +d[3]) return null;
  let utc = naive - offsetMs(naive, tz);
  utc = naive - offsetMs(utc, tz);
  const check = new Date(utc);
  return Number.isNaN(check.getTime()) ? null : check.toISOString();
}
/** YYYY-MM-DD of an instant in tz. */
export function dayKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function timeLabel(iso: string, tz: string, lang: "es" | "en") {
  return new Intl.DateTimeFormat(lang === "es" ? "es" : "en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export const when = (i: Pick<WorkItem, "starts_at" | "due_at">) => i.starts_at ?? i.due_at;

/** Calendar days for a view anchored on `anchor` (YYYY-MM-DD). Month = full weeks Monday→Sunday. */
export function viewDays(view: "month" | "week" | "day", anchor: string): string[] {
  const [y, m, d] = anchor.split("-").map(Number);
  const at = (date: Date) => date.toISOString().slice(0, 10);
  const base = new Date(Date.UTC(y, m - 1, d));
  if (view === "day") return [at(base)];
  const monday = (x: Date) => { const r = new Date(x); r.setUTCDate(r.getUTCDate() - ((r.getUTCDay() + 6) % 7)); return r; };
  if (view === "week") { const s = monday(base); return Array.from({ length: 7 }, (_, i) => at(new Date(s.getTime() + i * 86400000))); }
  const first = monday(new Date(Date.UTC(y, m - 1, 1))), last = new Date(Date.UTC(y, m, 0));
  const out: string[] = []; for (let x = first; x <= last || out.length % 7; x = new Date(x.getTime() + 86400000)) out.push(at(x));
  return out;
}
export function shiftAnchor(view: "month" | "week" | "day", anchor: string, dir: 1 | -1) {
  const [y, m, d] = anchor.split("-").map(Number);
  const x = view === "month" ? new Date(Date.UTC(y, m - 1 + dir, 1)) : new Date(Date.UTC(y, m - 1, d + dir * (view === "week" ? 7 : 1)));
  return x.toISOString().slice(0, 10);
}

/** Individual KPIs from real, RLS-visible records. No global finance, no other people's data, no simulated numbers. */
export function workKpis(items: WorkItem[], nowIso: string, extra: { leads: number; clients: number; casefilesOpen: number }) {
  const now = Date.parse(nowIso), in7 = now + 7 * 86400000, since30 = now - 30 * 86400000;
  const live = items.filter(i => i.status !== "cancelled");
  const open = live.filter(i => i.status !== "done");
  const at = (i: WorkItem) => Date.parse(when(i) ?? i.updated_at);
  return {
    assigned: live.filter(i => i.origin === "staff_assigned").length,
    open: open.length,
    overdue: open.filter(i => (i.due_at ? Date.parse(i.due_at) : i.ends_at ? Date.parse(i.ends_at) : Infinity) < now).length,
    upcoming7: open.filter(i => at(i) >= now && at(i) <= in7).length,
    done30: live.filter(i => i.status === "done" && i.completed_at && Date.parse(i.completed_at) >= since30).length,
    appointmentsScheduled: open.filter(i => i.kind === "appointment").length,
    appointmentsDone: live.filter(i => i.kind === "appointment" && i.status === "done").length,
    followUpsDone: live.filter(i => i.kind === "follow_up" && i.status === "done").length,
    followUpsPending: open.filter(i => i.kind === "follow_up").length,
    leadsWorked: new Set(live.filter(i => i.lead_id && (i.status === "done" || i.status === "in_progress")).map(i => i.lead_id)).size,
    ...extra,
  };
}
