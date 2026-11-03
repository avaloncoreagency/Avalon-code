/** Shared-calendar logic without network access; reused by UI and validated by unit tests. */
export const CALENDAR_COLORS = [
  "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#64748b",
] as const;
export const BANNER_THEMES = ["violet", "blue", "teal", "green", "amber", "rose"] as const;
export const EVENT_KINDS = ["meeting", "appointment", "call", "follow-up", "task", "personal"] as const;
/** Suggested, accessible color families by type; owners may override per event. */
export const EVENT_KIND_COLORS: Record<(typeof EVENT_KINDS)[number], (typeof CALENDAR_COLORS)[number]> = {
  meeting: "#8b5cf6",
  appointment: "#3b82f6",
  call: "#06b6d4",
  "follow-up": "#f59e0b",
  task: "#10b981",
  personal: "#ec4899",
};
export const EVENT_KIND_ICONS: Record<(typeof EVENT_KINDS)[number], string> = {
  meeting: "◆", appointment: "◉", call: "◌", "follow-up": "↗", task: "✓", personal: "✦",
};
export function colorForEventKind(kind: string): (typeof CALENDAR_COLORS)[number] {
  return EVENT_KIND_COLORS[kind as keyof typeof EVENT_KIND_COLORS] ?? CALENDAR_COLORS[0];
}

/** One reusable filter for owner, attendees and appointment type. */
export function matchesCalendarFilters(
  event: Pick<CalendarEvent, "status" | "kind" | "owner_id" | "attendee_ids">,
  ownerFilter: string, kindFilter: string
): boolean {
  if (event.status === "cancelled") return false;
  if (ownerFilter !== "all" && event.owner_id !== ownerFilter && !(event.attendee_ids || []).includes(ownerFilter)) return false;
  return kindFilter === "all" || ((EVENT_KINDS as readonly string[]).includes(kindFilter) && event.kind === kindFilter);
}

export type CalendarView = "month" | "week" | "day";
export type OwnerOption = { user_id: string; email: string };
export type CalendarEvent = {
  id: string; title: string; owner_id: string; attendee_ids: string[];
  starts_at: string; ends_at: string; timezone: string; all_day: boolean;
  kind: string; status: string; color: string; description: string;
  location: string; meeting_url: string; participants: string;
  lead_id: string | null; client_id: string | null; version: number;
  crm_leads?: { company: string } | null;
  crm_clients?: { legal_name: string } | null;
};
export type DayBanner = {
  id: string; day: string; title: string; subtitle: string;
  emoji: string; theme: string; version: number;
};
const DATE_RE = /^(20[2-9][0-9]|2100)-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/;
export function isCalendarDay(day: string): boolean {
  if (!DATE_RE.test(day)) return false;
  const date = new Date(day + "T12:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
export function moveDay(day: string, by: number): string {
  if (!isCalendarDay(day) || !Number.isSafeInteger(by) || Math.abs(by) > 5000) return day;
  const date = new Date(day + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}
export function moveMonth(day: string, by: number): string {
  if (!isCalendarDay(day) || !Number.isSafeInteger(by) || Math.abs(by) > 120) return day;
  const d = new Date(day.slice(0, 7) + "-01T12:00:00.000Z");
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}
export function visibleDays(day: string, view: CalendarView): string[] {
  if (!isCalendarDay(day)) return [];
  if (view === "day") return [day];
  const d = new Date(day + "T12:00:00.000Z");
  if (view === "month") d.setUTCDate(1);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  const first = d.toISOString().slice(0, 10);
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => moveDay(first, i));
}
export function dayInZone(timestamp: string, timeZone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const part = (type: string) => parts.find(p => p.type === type)?.value || "";
    return part("year") + "-" + part("month") + "-" + part("day");
  } catch { return ""; }
}
export function eventOnDay(event: CalendarEvent, day: string, zone: string): boolean {
  if (!isCalendarDay(day) || event.status === "cancelled") return false;
  const start = event.all_day ? event.starts_at.slice(0, 10) : dayInZone(event.starts_at, zone);
  const endMs = new Date(event.ends_at).getTime();
  if (!start || !Number.isFinite(endMs)) return false;
  const last = event.all_day ? moveDay(event.ends_at.slice(0, 10), -1) :
    dayInZone(new Date(endMs - 1).toISOString(), zone);
  return start <= day && day <= last;
}
export function hourInZone(timestamp: string, zone: string): number {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "2-digit", hourCycle: "h23" })
      .format(new Date(timestamp)));
  } catch { return -1; }
}
export function localInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

/** Calendar links always point to the protected pipeline lead detail, never a public URL. */
export function leadCardHref(id: string | null | undefined): string | null {
  if (!id || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  return "/admin/workspace/crm/leads?lead=" + encodeURIComponent(id);
}

/** Names come from the event's RLS-protected relationship, then the recent-lead picker. */
export function linkedLeadName(event: CalendarEvent, leads: { id: string; company: string }[]): string | null {
  if (!event.lead_id) return null;
  return event.crm_leads?.company || leads.find(lead => lead.id === event.lead_id)?.company || null;
}

/** Confirmed-sale metadata loaded under owner RLS; ordered newest first by the server. */
export type CalendarSale = { id: string; client_id: string; sale_number: string; sold_on: string; crm_clients: { legal_name: string } | null };
export type CalendarClient = { id: string; legal_name: string };
const SALE_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function linkedClientName(event: CalendarEvent, clients: CalendarClient[], sales: CalendarSale[]): string | null {
  if (!event.client_id) return null;
  return event.crm_clients?.legal_name || clients.find(client => client.id === event.client_id)?.legal_name || sales.find(sale => sale.client_id === event.client_id)?.crm_clients?.legal_name || null;
}
export function purchasedClientOptions(sales: CalendarSale[]): CalendarClient[] {
  const seen = new Set<string>();
  return sales.flatMap(sale => {
    if (!SALE_ID_RE.test(sale.client_id) || !sale.crm_clients?.legal_name || seen.has(sale.client_id)) return [];
    seen.add(sale.client_id);
    return [{ id: sale.client_id, legal_name: sale.crm_clients.legal_name }];
  }).sort((a, b) => a.legal_name.localeCompare(b.legal_name));
}
export function salesForCalendarClient(clientId: string | null | undefined, sales: CalendarSale[]): CalendarSale[] {
  if (!clientId || !SALE_ID_RE.test(clientId)) return [];
  return sales.filter(sale => sale.client_id === clientId && SALE_ID_RE.test(sale.id));
}
/** Customer label opens a confirmed sale; client 360 is the fallback for older purchases. */
export function clientSalesCardHref(clientId: string | null | undefined, sales: CalendarSale[]): string | null {
  if (!clientId || !SALE_ID_RE.test(clientId)) return null;
  const first = salesForCalendarClient(clientId, sales)[0];
  return first ? "/admin/workspace/crm/sales/" + encodeURIComponent(first.id) : "/admin/workspace/crm/clients/" + encodeURIComponent(clientId);
}
