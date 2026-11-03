const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const calendarPath = path.resolve("src/lib/crm/shared-calendar.ts");
const calendarJs = ts.transpileModule(fs.readFileSync(calendarPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const calendarMod = new Module(calendarPath, module);
calendarMod.filename = calendarPath;
calendarMod._compile(calendarJs, calendarPath);
const {
  purchasedClientOptions, linkedClientName, clientSalesCardHref,
  salesForCalendarClient, CALENDAR_COLORS,
} = calendarMod.exports;

const owner = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const recentSale = "44444444-4444-4444-8444-444444444444";
const oldSale = "55555555-5555-4555-8555-555555555555";
const eventId = "66666666-6666-4666-8666-666666666666";

function sales() {
  return [
    { id: recentSale, client_id: customer, sale_number: "VEN-2026-101", sold_on: "2026-11-02", crm_clients: { legal_name: "Cliente Demo" } },
    { id: oldSale, client_id: customer, sale_number: "VEN-2026-001", sold_on: "2026-05-01", crm_clients: { legal_name: "Cliente Demo" } },
    { id: "77777777-7777-4777-8777-777777777777", client_id: other, sale_number: "VEN-2026-002", sold_on: "2026-06-01", crm_clients: { legal_name: "Otro Demo" } },
  ];
}

test("calendar customer tags open the newest available sale with direct authorized URLs", () => {
  assert.equal(clientSalesCardHref(customer, sales()), "/admin/workspace/crm/sales/" + recentSale);
  assert.deepEqual(salesForCalendarClient(customer, sales()).map(x => x.id), [recentSale, oldSale]);
  assert.equal(clientSalesCardHref("88888888-8888-4888-8888-888888888888", sales()),
    "/admin/workspace/crm/clients/88888888-8888-4888-8888-888888888888");
  for (const invalid of ["", null, "../other", "https://example.com", "x".repeat(200)]) {
    assert.equal(clientSalesCardHref(invalid, sales()), null);
  }
});

test("purchasing customers are deduplicated by client UUID and sorted by customer name", () => {
  assert.deepEqual(purchasedClientOptions(sales()), [
    { id: customer, legal_name: "Cliente Demo" },
    { id: other, legal_name: "Otro Demo" },
  ]);
  assert.deepEqual(purchasedClientOptions([{ id: recentSale, client_id: "not-uuid", crm_clients: { legal_name: "Forged" } }]), []);
});

test("linked customer name comes from the event relation, even outside the recent sales window", () => {
  const event = { client_id: customer, crm_clients: { legal_name: "Cliente con compra antigua" } };
  assert.equal(linkedClientName(event, [], []), "Cliente con compra antigua");
  assert.equal(linkedClientName({ client_id: customer, crm_clients: null }, [], sales()), "Cliente Demo");
  assert.equal(linkedClientName({ client_id: null }, [], sales()), null);
});

function form(clientId = customer, id = null) {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    title: "Reunión de seguimiento sintética", kind: "meeting", color: CALENDAR_COLORS[0],
    owner_id: owner, timezone: "America/New_York", all_day: "no",
    starts_at: "2026-11-10T15:00:00.000Z", ends_at: "2026-11-10T16:00:00.000Z",
    client_id: clientId,
  })) data.set(name, value);
  if (id) { data.set("id", id); data.set("version", "1"); }
  return data;
}

function actions({ purchases = [], purchaseError = null, existingClient = null } = {}) {
  const inserted = [], updated = [], filters = [];
  let selectColumn = null;
  const supabase = {
    rpc(name) {
      assert.equal(name, "crm_owner_directory");
      return Promise.resolve({ data: [{ user_id: owner }], error: null });
    },
    from(table) {
      if (table === "crm_sales") return {
        select(columns) { assert.equal(columns, "id"); return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        async limit(n) { assert.equal(n, 1); return { data: purchases, error: purchaseError }; },
      };
      assert.equal(table, "crm_events");
      return {
        select(column) { selectColumn = column; return this; },
        eq() { return this; },
        update(payload) { updated.push(payload); return this; },
        async maybeSingle() {
          return selectColumn === "client_id"
            ? { data: existingClient ? { client_id: existingClient } : null, error: null }
            : { data: { id: eventId }, error: null };
        },
        async insert(payload) { inserted.push(payload); return { error: null }; },
      };
    },
  };
  const actionsPath = path.resolve("src/app/admin/workspace/crm/calendar/actions.ts");
  const js = ts.transpileModule(fs.readFileSync(actionsPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const read = (data, name) => typeof data.get(name) === "string" ? data.get(name) : "";
  const isUuid = value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const mocks = {
    "next/cache": { revalidatePath() {} },
    "@/lib/os/actions": {
      ownerForAction: async () => ({ supabase, userId: owner }),
      field: read,
      uuidField: (data, name) => isUuid(read(data, name)) ? read(data, name) : null,
    },
    "@/lib/crm/shared-calendar": calendarMod.exports,
  };
  const m = new Module(actionsPath, module);
  m.filename = actionsPath;
  m.require = name => {
    assert.ok(Object.hasOwn(mocks, name), "unexpected import: " + name);
    return mocks[name];
  };
  m._compile(js, actionsPath);
  return { saveCalendarEvent: m.exports.saveCalendarEvent, inserted, updated, filters };
}

test("new calendar customer tag requires confirmed sales under owner authorization", async () => {
  const { saveCalendarEvent, inserted, filters } = actions({ purchases: [{ id: recentSale }] });
  const result = await saveCalendarEvent(form());
  assert.equal(result.status, "ok");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].client_id, customer);
  assert.ok(filters.some(([field, value]) => field === "client_id" && value === customer));
  assert.ok(filters.some(([field, value]) => field === "status" && value === "confirmed"));
});

test("unsold customer UUID cannot be tagged on a new calendar appointment", async () => {
  const { saveCalendarEvent, inserted } = actions({ purchases: [] });
  const result = await saveCalendarEvent(form());
  assert.equal(result.status, "invalid");
  assert.match(result.message, /compra confirmada/);
  assert.equal(inserted.length, 0);
});

test("a denied sales lookup does not write any unverified customer tag", async () => {
  const { saveCalendarEvent, inserted } = actions({ purchaseError: { code: "42501" } });
  const result = await saveCalendarEvent(form());
  assert.equal(result.status, "unavailable");
  assert.equal(inserted.length, 0);
});

test("old appointments can preserve their unchanged client association on edits", async () => {
  const { saveCalendarEvent, updated } = actions({ existingClient: customer });
  const result = await saveCalendarEvent(form(customer, eventId));
  assert.equal(result.status, "ok");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].client_id, customer);
});

test("an owner cannot switch an old event to a different customer with no sale", async () => {
  const { saveCalendarEvent, updated } = actions({ existingClient: other });
  const result = await saveCalendarEvent(form(customer, eventId));
  assert.equal(result.status, "invalid");
  assert.equal(updated.length, 0);
});

test("month, week, day and editor show actionable customer sales links", () => {
  const ui = fs.readFileSync("src/components/crm/shared-calendar.tsx", "utf8");
  const page = fs.readFileSync("src/app/admin/workspace/crm/calendar/page.tsx", "utf8");
  assert.match(ui, /clientSalesCardHref\(event\.client_id, sales\)/);
  assert.match(ui, /linkedClientName\(event, clients, sales\)/);
  assert.match(ui, /salesForCalendarClient\(event\.client_id, sales\)/);
  assert.match(ui, /name="client_id" value=\{draft\.client_id\}/);
  assert.match(ui, /pickerClients\.map/);
  assert.match(ui, /Ver venta o historial/);
  assert.match(page, /crm_sales"\)\.select\("id,client_id,sale_number,sold_on,crm_clients\(legal_name\)"\)/);
  assert.match(page, /eq\("status", "confirmed"\)/);
});
