/** Avalon commercial workday is anchored to the agency's Miami/Eastern timezone, not the Vercel server's UTC timezone. */
export const CRM_BUSINESS_TIME_ZONE = "America/New_York";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: CRM_BUSINESS_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(instant: Date): ZonedParts {
  const fields = Object.fromEntries(clock.formatToParts(instant)
    .filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  return fields as ZonedParts;
}

/** Convert a valid local midnight to UTC, resolving the Eastern offset at that instant (including DST). */
function midnightInUtc(year: number, month: number, day: number): string {
  const requested = Date.UTC(year, month - 1, day);
  let guess = requested;
  for (let iteration = 0; iteration < 4; iteration++) {
    const seen = partsAt(new Date(guess));
    const represented = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    const delta = requested - represented;
    guess += delta;
    if (delta === 0) return new Date(guess).toISOString();
  }
  throw new Error("Could not calculate the CRM business-day boundary");
}

/** Exclusive upper bound prevents double-counting the instant at the beginning of the next day. */
export function crmBusinessDayBounds(now: Date = new Date()): { start: string; end: string } {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid CRM business-day instant");
  const { year, month, day } = partsAt(now);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: midnightInUtc(year, month, day),
    end: midnightInUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()),
  };
}
