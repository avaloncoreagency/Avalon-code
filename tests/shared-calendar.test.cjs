const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const filename = path.resolve("src/lib/crm/shared-calendar.ts");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod._compile(compiled, filename);
const { visibleDays, isCalendarDay, moveDay, moveMonth, dayInZone, eventOnDay, hourInZone,
  CALENDAR_COLORS, BANNER_THEMES, EVENT_KINDS, leadCardHref, linkedLeadName } = mod.exports;

test("calendar offers correct month, week and day views including leap years", () => {
  const month = visibleDays("2028-02-17", "month");
  assert.equal(month.length, 42);
  assert.equal(month[0], "2028-01-30");
  assert.ok(month.includes("2028-02-29"));
  assert.equal(month.at(-1), "2028-03-11");
  assert.deepEqual(visibleDays("2026-11-04", "week"), [
    "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04",
    "2026-11-05", "2026-11-06", "2026-11-07",
  ]);
  assert.deepEqual(visibleDays("2026-11-04", "day"), ["2026-11-04"]);
});

test("date navigation validates dates rather than accepting overflow or hostile input", () => {
  assert.equal(isCalendarDay("2026-02-30"), false);
  assert.equal(isCalendarDay("2028-02-29"), true);
  assert.equal(isCalendarDay("../2026-11-04"), false);
  assert.equal(moveDay("2026-12-31", 1), "2027-01-01");
  assert.equal(moveMonth("2026-01-31", 1), "2026-02-01");
  assert.equal(visibleDays("not a date", "month").length, 0);
});

test("shared events display correctly when owners have different time zones", () => {
  assert.equal(dayInZone("2026-11-03T01:00:00.000Z", "America/New_York"), "2026-11-02");
  assert.equal(dayInZone("2026-11-03T01:00:00.000Z", "UTC"), "2026-11-03");
  assert.equal(hourInZone("2026-11-02T14:30:00.000Z", "America/New_York"), 9);
});

test("events crossing midnight, cancellation and all-day exclusive end are handled", () => {
  const event = { status: "scheduled", all_day: false,
    starts_at: "2026-11-02T23:00:00.000Z", ends_at: "2026-11-03T02:00:00.000Z" };
  assert.equal(eventOnDay(event, "2026-11-02", "UTC"), true);
  assert.equal(eventOnDay(event, "2026-11-03", "UTC"), true);
  assert.equal(eventOnDay(event, "2026-11-04", "UTC"), false);
  assert.equal(eventOnDay({ ...event, status: "cancelled" }, "2026-11-02", "UTC"), false);
  const allDay = { status: "scheduled", all_day: true,
    starts_at: "2026-11-02T00:00:00.000Z", ends_at: "2026-11-04T00:00:00.000Z" };
  assert.equal(eventOnDay(allDay, "2026-11-02", "America/New_York"), true);
  assert.equal(eventOnDay(allDay, "2026-11-03", "America/New_York"), true);
  assert.equal(eventOnDay(allDay, "2026-11-04", "America/New_York"), false);
});

test("color and banner themes are restricted to known safe options", () => {
  assert.equal(CALENDAR_COLORS.length, 8);
  assert.equal(new Set(CALENDAR_COLORS).size, CALENDAR_COLORS.length);
  assert.ok(BANNER_THEMES.includes("rose"));
  assert.ok(EVENT_KINDS.includes("appointment"));
});

test("calendar server mutations always reauthorize and validate selected owners", () => {
  const server = fs.readFileSync("src/app/admin/workspace/crm/calendar/actions.ts", "utf8");
  const page = fs.readFileSync("src/app/admin/workspace/crm/calendar/page.tsx", "utf8");
  for (const fn of ["saveCalendarEvent", "cancelCalendarEvent", "saveCalendarBanner", "deleteCalendarBanner"])
    assert.match(server, new RegExp("export async function " + fn));
  assert.ok((server.match(/ownerForAction\(\)/g) || []).length >= 4);
  assert.match(server, /crm_owner_directory/);
  assert.match(server, /allowed\.has\(ownerId\)/);
  assert.match(server, /eq\("version", version\)/);
  assert.match(page, /requireOwner\(\)/);
  assert.match(page, /<SharedCalendar/);
});

test("migration preserves CRM events, protects attendance conflicts, and RLS-scopes banners", () => {
  const sql = fs.readFileSync("supabase/migrations/20261102220000_shared_calendar.sql", "utf8");
  assert.match(sql, /alter table public\.crm_events/);
  assert.match(sql, /crm_private\.event_conflict/);
  assert.match(sql, /e\.attendee_ids && new\.attendee_ids/);
  assert.match(sql, /crm_calendar_banners enable row level security/);
  assert.match(sql, /crm_private\.is_owner\(\)/);
  assert.match(sql, /revoke all on public\.crm_calendar_banners from anon/);
  assert.doesNotMatch(sql, /grant .* to anon/i);
  const ui = fs.readFileSync("src/components/crm/shared-calendar.tsx", "utf8");
  for (const feature of ["downloadIcs", "saveCalendarEvent", "saveCalendarBanner", "month", "week", "day", "meeting_url", "attendee_ids"])
    assert.ok(ui.includes(feature), "missing shared calendar capability: " + feature);
});


test("event lead tags use the private pipeline deep link and reject invalid identifiers", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(leadCardHref(id), "/admin/workspace/crm/leads?lead=" + id);
  for (const invalid of ["", null, "../external", "https://example.com", "x".repeat(256)]) {
    assert.equal(leadCardHref(invalid), null);
  }
});

test("calendar lead label comes from the authorized relationship even outside recent picker", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(linkedLeadName({ lead_id: id, crm_leads: { company: "Synthetic Older Lead" } }, []), "Synthetic Older Lead");
  assert.equal(linkedLeadName({ lead_id: id, crm_leads: null }, [{ id, company: "Synthetic Recent Lead" }]), "Synthetic Recent Lead");
  assert.equal(linkedLeadName({ lead_id: null, crm_leads: null }, [{ id, company: "Synthetic Recent Lead" }]), null);
});

test("shared calendar lets owners search the existing protected CRM and tag meetings", () => {
  const ui = fs.readFileSync("src/components/crm/shared-calendar.tsx", "utf8");
  const page = fs.readFileSync("src/app/admin/workspace/crm/calendar/page.tsx", "utf8");
  assert.match(ui, /fetch\("\/admin\/workspace\/crm\/api\?entity=leads&page=0&q="/);
  assert.match(ui, /name="lead_id" value=\{draft\.lead_id\}/);
  assert.match(ui, /leadCardHref\(event\.lead_id\)/);
  assert.match(ui, /linkedLeadName\(event, leads\)/);
  assert.match(ui, /href=\{leadCardHref\(draft\.lead_id\)!\}/);
  assert.match(page, /crm_leads\(company\)/);
  assert.match(page, /requireOwner\(\)/);
});

test("the lead card shows saved contact, pipeline stage, follow-up and history", () => {
  const ui = fs.readFileSync("src/components/crm/crm.tsx", "utf8");
  for (const label of ["Ficha del lead", "Persona de contacto", "Etapa del pipeline", "Próximo seguimiento", "Correo", "Teléfono", "Valor estimado", "Añadir nota / actividad"])
    assert.ok(ui.includes(label), "missing lead detail: " + label);
  assert.match(ui, /fetchLead\(false\)/);
  assert.match(ui, /fetchLead\(true\)/, "historical calendar links should still open archived leads");
  assert.match(ui, /entity=leads&id=/);
});
