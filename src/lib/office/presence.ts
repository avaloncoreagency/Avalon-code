/** Scheduled availability, not session presence. Three mutually exclusive staff states. */
export type PresenceState = "active" | "busy" | "inactive";
export type PresenceReason = "available" | "calendar" | "time_off" | "out_of_hours" | "unconfigured" | "unavailable";
export type StaffPresence = { state: PresenceState; reason: PresenceReason };

export type StaffHours = {
  user_id: string;
  timezone: string;
  weekly_hours: Record<string, unknown> | null;
};
export type StaffTimeOff = { user_id: string; starts_on: string; ends_on: string };
export type StaffCalendarEvent = {
  owner_id: string; attendee_ids: string[] | null; starts_at: string; ends_at: string; status: string;
};

const DAYS: Record<string, string> = {
  Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat", Sun: "sun",
};
const hhmm = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Timezone-aware local date and time: DST comes from Intl, never the viewer's clock. */
export function zonedMoment(now: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const field = (type: string) => values.find(part => part.type === type)?.value ?? "";
  return {
    day: DAYS[field("weekday")],
    date: `${field("year")}-${field("month")}-${field("day")}`,
    time: `${field("hour")}:${field("minute")}`,
  };
}

/** Precedence: off-hours / time-off = inactive, scheduled meeting = busy, otherwise active. */
export function staffPresence(
  userId: string,
  hours: StaffHours | null | undefined,
  timeOff: StaffTimeOff[],
  events: StaffCalendarEvent[],
  now: Date = new Date(),
): StaffPresence {
  if (!hours?.timezone || !hours.weekly_hours) return { state: "inactive", reason: "unconfigured" };
  let local: ReturnType<typeof zonedMoment>;
  try { local = zonedMoment(now, hours.timezone); }
  catch { return { state: "inactive", reason: "unavailable" }; }
  if (timeOff.some(x => x.user_id === userId && x.starts_on <= local.date && local.date <= x.ends_on))
    return { state: "inactive", reason: "time_off" };

  const range = hours.weekly_hours[local.day];
  if (!Array.isArray(range) || range.length !== 2 ||
    typeof range[0] !== "string" || typeof range[1] !== "string" ||
    !hhmm.test(range[0]) || !hhmm.test(range[1]) ||
    !(range[0] <= local.time && local.time < range[1]))
    return { state: "inactive", reason: "out_of_hours" };

  const epoch = now.getTime();
  const occupied = events.some(event =>
    event.status === "scheduled" &&
    (event.owner_id === userId || (event.attendee_ids ?? []).includes(userId)) &&
    Date.parse(event.starts_at) <= epoch && epoch < Date.parse(event.ends_at));
  return occupied ? { state: "busy", reason: "calendar" } : { state: "active", reason: "available" };
}

export const INACTIVE: StaffPresence = { state: "inactive", reason: "unavailable" };
