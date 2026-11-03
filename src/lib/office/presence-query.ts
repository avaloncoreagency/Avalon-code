import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INACTIVE, staffPresence, type StaffCalendarEvent, type StaffHours, type StaffPresence, type StaffTimeOff } from "./presence";

/** Uses the existing authenticated Supabase client and RLS; never a service key. */
export async function loadStaffPresence(db: SupabaseClient, userIds: string[], now = new Date()) {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 100);
  const byUser: Record<string, StaffPresence> = {};
  const hoursByUser = new Map<string, StaffHours>();
  const timeOffByUser = new Map<string, StaffTimeOff[]>();
  if (ids.length === 0) return { byUser, hoursByUser, timeOffByUser, unavailable: false };

  // Cover the user's local calendar date even when it differs from the UTC date.
  const fromDay = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const toDay = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  const stamp = now.toISOString();
  const [hours, absences, calendar] = await Promise.all([
    db.from("office_availability").select("user_id,timezone,weekly_hours").in("user_id", ids).limit(100),
    db.from("office_time_off").select("user_id,starts_on,ends_on,reason")
      .in("user_id", ids).lte("starts_on", toDay).gte("ends_on", fromDay).limit(300),
    db.from("crm_events").select("owner_id,attendee_ids,starts_at,ends_at,status")
      .eq("status", "scheduled").lte("starts_at", stamp).gt("ends_at", stamp).limit(300),
  ]);

  const unavailable = !!(hours.error || absences.error || calendar.error);
  for (const item of (hours.data ?? []) as StaffHours[]) hoursByUser.set(item.user_id, item);
  for (const item of (absences.data ?? []) as StaffTimeOff[]) {
    const current = timeOffByUser.get(item.user_id) ?? [];
    current.push(item);
    timeOffByUser.set(item.user_id, current);
  }
  const events = (calendar.data ?? []) as StaffCalendarEvent[];
  for (const userId of ids)
    byUser[userId] = unavailable ? INACTIVE
      : staffPresence(userId, hoursByUser.get(userId), timeOffByUser.get(userId) ?? [], events, now);

  return { byUser, hoursByUser, timeOffByUser, unavailable };
}
