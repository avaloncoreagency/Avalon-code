/** Calendar presentation adapter. The server remains the authority for conflicts and writes. */
export function calendarInput(iso: string, zone = "America/New_York"): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const p = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}

type Instant = { iso: string; error?: never } | { error: "invalid" | "nonexistent" | "ambiguous"; iso?: never };
export function calendarInstant(value: string, zone = "America/New_York", previous?: string): Instant {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return { error: "invalid" };
  const wall = Date.parse(value + ":00Z");
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) return { error: "invalid" };
  // Preserve the exact stored instant (including its DST occurrence) when editing another field.
  if (previous && calendarInput(previous, zone) === value) return { iso: new Date(previous).toISOString() };
  const matches = new Set<string>();
  for (const hours of [-36, 0, 36]) {
    const probe = wall + hours * 3_600_000;
    const offset = Date.parse(calendarInput(new Date(probe).toISOString(), zone) + ":00Z") - probe;
    const iso = new Date(wall - offset).toISOString();
    if (calendarInput(iso, zone) === value) matches.add(iso);
  }
  if (!matches.size) return { error: "nonexistent" };
  if (matches.size > 1) return { error: "ambiguous" };
  return { iso: [...matches][0] };
}
