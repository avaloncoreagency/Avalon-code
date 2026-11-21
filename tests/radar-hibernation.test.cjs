// Radar hibernation (owner directive 2026-11-20): Radar must not appear in the active commercial UI, and its page must not
// load the Radar component (map tiles / provider calls) unless the server-side switch is explicitly enabled.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = f => fs.readFileSync(f, "utf8");

test("CRM navigation only lists Radar when the server switch is on; website inquiries are listed instead", () => {
  const nav = read("src/components/crm/navigation.tsx");
  assert.doesNotMatch(nav.slice(nav.indexOf("const tools"), nav.indexOf("] as const;")), /\/crm\/hunter/, "Radar is not a regular tool");
  assert.match(nav, /const showRadar = radar \?\? radarExternalEnabled\(\);/);
  assert.match(nav, /showRadar \? \[radarTool\] : \[\]/);
  // Client components cannot read the server-only switch: they must receive it evaluated on the server.
  const crm = fs.readFileSync("src/components/crm/crm.tsx", "utf8");
  assert.match(crm, /<CrmTools active=\{section\} lang=\{lang\} radar=\{radarEnabled\} \/>/);
  assert.match(fs.readFileSync("src/app/admin/workspace/crm/[section]/page.tsx", "utf8"), /radarEnabled=\{radarExternalEnabled\(\)\}/);
  assert.match(fs.readFileSync("src/components/crm/overview.tsx", "utf8"), /<CrmTools active="overview" radar=\{radarEnabled\} lang=\{lang\} \/>/);
  assert.match(nav, /\/admin\/workspace\/crm\/inbound/);
});

test("the Radar page renders a server-side suspension notice before the Radar component when disabled", () => {
  const page = read("src/app/admin/workspace/crm/[section]/page.tsx");
  const gate = page.indexOf('section === "hunter" && !radarExternalEnabled()');
  assert.ok(gate > 0, "hunter route is gated by the server switch");
  assert.ok(gate < page.indexOf("<Crm "), "the gate runs before the CRM client component (TitanRadar) is rendered");
  assert.match(page, /await requireOwner\(\)/, "the suspended page still requires an owner");
});

test("no active commercial screen links to Radar; pending inquiries open the website inbox", () => {
  const roots = ["src/app", "src/components"];
  const files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) && files.push(p); } };
  roots.forEach(walk);
  const allowed = new Set(["src/components/crm/navigation.tsx", "src/components/crm/crm.tsx", "src/components/crm/titan-radar.tsx"].map(f => path.normalize(f)));
  const offenders = files.filter(f => !allowed.has(path.normalize(f)) && !f.includes(`${path.sep}radar${path.sep}`) && /href=\{?["'`]\/admin\/workspace\/crm\/hunter|["'`]\/admin\/workspace\/crm\/hunter["'`],/.test(read(f)));
  assert.deepEqual(offenders, [], "only the gated navigation entry may point to Radar");
  assert.match(read("src/components/crm/command-summary.tsx"), /\/admin\/workspace\/crm\/inbound/);
  assert.doesNotMatch(read("src/components/crm/intel/quick-add.tsx"), /"radar", "Radar \/ Lead Hunter"/, "new leads are not tagged as Radar");
});

test("every provider-facing entrypoint is behind the same switch (single flag, no contradictory toggles)", () => {
  const files = ["src/lib/crm/radar-search.ts", "src/lib/crm/radar-research.ts", "src/app/admin/workspace/crm/radar/geocode/route.ts",
    "src/app/admin/workspace/crm/radar/research/route.ts", "src/app/admin/workspace/crm/radar/campaigns/route.ts"];
  for (const f of files) assert.match(read(f), /radarExternalEnabled\(\)/, f);
  assert.match(read("supabase/functions/avalon-radar-worker/index.ts"), /AVALON_RADAR_EXTERNAL_ENABLED/);
  const flags = new Set();
  for (const f of ["src/lib/crm/radar-control.ts", ...files]) for (const m of read(f).matchAll(/process\.env\.([A-Z_]*RADAR[A-Z_]*ENABLED[A-Z_]*)|env\.([A-Z_]*RADAR[A-Z_]*ENABLED)/g)) flags.add(m[1] || m[2]);
  assert.deepEqual([...flags], ["AVALON_RADAR_EXTERNAL_ENABLED"]);
});

test("no visible Radar copy remains in the daily UI (Office, settings, inbox); only the direct-URL suspension notice", () => {
  for (const file of ["src/lib/office/manager-work.ts", "src/lib/office/hq-layout.ts", "src/components/office/manager-workstation.tsx",
    "src/app/admin/settings/page.tsx", "src/app/admin/workspace/crm/inbound/page.tsx", "src/components/crm/command-summary.tsx",
    "src/components/crm/intel/quick-add.tsx", "src/components/suite/modules.ts"]) {
    const visible = fs.readFileSync(file, "utf8").split("\n").filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
    assert.doesNotMatch(visible, /"[^"]*\b(Radar|Lead Hunter)\b[^"]*"/, `${file} shows Radar to users`);
  }
});

test("the deployed worker is a hibernation stub; the full worker stays in the repository", () => {
  const plan = fs.readFileSync("docs/radar/RADAR_REACTIVATION_PLAN.md", "utf8");
  assert.match(plan, /v11/);
  assert.match(plan, /423/);
  for (const file of ["index.ts", "radar-research.ts", "radar-website-safety.ts"])
    assert.ok(fs.existsSync("supabase/functions/avalon-radar-worker/" + file), file + " preserved");
});
