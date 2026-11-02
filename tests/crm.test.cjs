const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const moduleObject = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("src/lib/crm/domain.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: moduleObject.exports,
    module: moduleObject,
    require,
    Intl,
    Date,
    Set,
    Map,
    Error,
  },
);
const { validate, parseCsv, scoreProspect, metrics, crmNavigation } = moduleObject.exports;
const owner = "00000000-0000-4000-8000-000000000001";
const lead = {
  company: "Synthetic Company",
  contact: "Test",
  email: "TEST@example.invalid",
  source: "test",
  owner_id: owner,
  stage_id: "new",
};
test("lead normalization and writable field allowlist", () => {
  const l = validate("leads", {
    ...lead,
    created_by: "attacker",
    agency_key: "other",
    value: "12.34",
  });
  assert.equal(l.email, "test@example.invalid");
  assert.equal(l.value, 12.34);
  assert.equal(l.created_by, undefined);
  assert.equal(l.agency_key, undefined);
});
test("reject invalid contact, owner, amount, probability and dates", () => {
  for (const p of [
    { email: "bad" },
    { owner_id: "x" },
    { value: -1 },
    { value: "Infinity" },
    { probability: 101 },
    { follow_up_at: "2026-01-01T09:00" },
  ])
    assert.throws(() => validate("leads", { ...lead, ...p }));
});
test("calendar validates timezone, offset and positive duration", () => {
  const event = {
    title: "Test",
    owner_id: owner,
    starts_at: "2026-11-01T01:30:00-04:00",
    ends_at: "2026-11-01T01:30:00-05:00",
    timezone: "America/New_York",
  };
  assert.equal(validate("events", event).ends_at, "2026-11-01T06:30:00.000Z");
  assert.throws(() =>
    validate("events", { ...event, timezone: "Invalid/Zone" }),
  );
  assert.throws(() =>
    validate("events", { ...event, ends_at: event.starts_at }),
  );
});
test("CSV handles BOM, quotes, multiline, CRLF and rejects malformed input", () => {
  const rows = parseCsv(
    '\ufeffcompany,source,opportunity\r\n"Synthetic, Inc",manual,"Line 1\nLine ""2"""\r\n',
  );
  assert.equal(rows[0].company, "Synthetic, Inc");
  assert.equal(rows[0].opportunity, 'Line 1\nLine "2"');
  for (const csv of [
    "company,source,opportunity\na,b",
    "company,source,source\na,b,c",
    'company,source,opportunity\n"x,b,c',
    'company,source,opportunity\n"x"oops,b,c',
  ])
    assert.throws(() => parseCsv(csv));
});
test("CSV bounds and score explanation", () => {
  assert.throws(() =>
    parseCsv(
      "company,source,opportunity\n" + Array(201).fill("a,b,c").join("\n"),
    ),
  );
  assert.equal(scoreProspect({ opportunity: "Documented" }).score, 30);
  assert.match(scoreProspect({ email: "a" }).reasons[0], /25/);
});
test("manual usage never accepts synchronized source mode; unknown limit remains null", () => {
  const row = validate("usage", {
    provider: "Codex",
    amount: 3,
    unit: "credits",
    source: "manual",
    period_start: "2026-11-01T00:00:00Z",
    period_end: "2026-12-01T00:00:00Z",
    mode: "synced",
  });
  assert.equal(row.mode, "manual");
  assert.equal(row.limit_value, null);
});
test("metrics exclude archived and closed pipeline and handle zero denominator", () => {
  const stages = [
    { id: "new", kind: "open" },
    { id: "won", kind: "won" },
    { id: "lost", kind: "lost" },
  ];
  const leads = [
    { id: "a", stage_id: "new", value: 100, follow_up_at: "2020-01-01Z" },
    { id: "b", stage_id: "won", value: 200 },
    { id: "c", stage_id: "lost", value: 400 },
    { id: "d", stage_id: "new", value: 1000, archived: true },
  ];
  const m = metrics(
    leads,
    [
      { lead_id: "a", status: "pending" },
      { lead_id: "d", status: "completed" },
    ],
    stages,
    Date.now(),
  );
  assert.equal(m.open, 100);
  assert.equal(m.won, 200);
  assert.equal(m.pending, 1);
  assert.equal(m.completed, 0);
  assert.equal(m.created, 3);
  assert.equal(m.overdue, 1);
  assert.equal(metrics([], [], stages, Date.now()).conversion, 0);
});

test("CRM primary navigation matches the approved five-tab workflow", () => {
  assert.deepEqual(
    Array.from(crmNavigation, (tab) => tab.label),
    ["Lead Hunter", "Leads Pipeline", "Ventas", "Calendario", "Tareas"],
  );
  assert.equal(new Set(crmNavigation.map((tab) => tab.href)).size, 5);
  assert.ok(crmNavigation.every((tab) => tab.href.startsWith("/admin/workspace/crm/")));
});

test("CRM home uses the overview instead of disguising Leads as the landing page", () => {
  const homepage = fs.readFileSync("src/app/admin/workspace/crm/page.tsx", "utf8");
  const overview = fs.readFileSync("src/components/crm/overview.tsx", "utf8");
  assert.match(homepage, /<CrmOverview\s*\/>/);
  assert.match(overview, /Uso de tokens y costos/);
  assert.match(overview, /Urgentes/);
  assert.match(overview, /Normales/);
  assert.match(overview, /no están conectadas/);
});
