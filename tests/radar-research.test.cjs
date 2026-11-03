const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function compile(path, deps = {}) {
  const raw = fs.readFileSync(path, "utf8");
  const compiled = ts.transpileModule(raw, {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const bad = (compiled.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(bad.map(x => ts.flattenDiagnosticMessageText(x.messageText, "\n")), [], "TypeScript syntax");
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled.outputText)(mod, mod.exports,
    id => id in deps ? deps[id] : require(id));
  return mod.exports;
}
const safety = compile("src/lib/crm/radar-website-safety.ts");
const parser = compile("src/lib/crm/radar-research.ts", { "./radar-website-safety": safety });

const official = "https://blueharbordental.example.org";
const homepage = [
  "<html><head><title>Blue Harbor Dental - Miami</title>",
  '<meta name="description" content="Dental care for families">',
  '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
  '<body><h1>Welcome to Blue Harbor Dental</h1>',
  '<a href="/services">Services</a><a href="/contact">Contact us</a>',
  '<a href="/book">Book Appointment</a><a href="https://instagram.com/blueharbor">Instagram</a>',
  "</body></html>",
].join("");
const fetched = (html, url = official + "/", status = 200) =>
  ({ text: html, url, status, complete: true, contentType: "text/html; charset=utf-8" });

test("website parser accepts only public HTTPS domains (upgrades legacy http)", () => {
  assert.equal(safety.websiteUrl("http://example.org/path").href, "https://example.org/path");
  for (const value of [
    "http://127.0.0.1", "https://localhost", "https://foo.internal",
    "https://[::1]/", "file:///etc/passwd", "http://10.0.0.1",
    "https://admin:secret@example.org/", "https://example.org:8080/",
    "https://a.local", "https://172.30.1.4", "https://foo.test",
  ]) assert.equal(safety.websiteUrl(value), null, value);
});

test("DNS validation rejects internal, metadata, CGNAT and documentation address space", () => {
  for (const ip of ["127.0.0.1", "10.0.0.2", "100.64.1.2", "169.254.169.254",
    "192.168.1.1", "172.16.1.9", "203.0.113.1", "198.51.100.2",
    "2001:db8::1", "fe80::1", "fc00::1", "::1", "::ffff:127.0.0.1"])
    assert.equal(safety.isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    assert.equal(safety.isPublicAddress(ip), true, ip);
});

test("robots.txt longest allow/disallow and named agent matching", () => {
  const raw = [
    "User-agent: *", "Disallow: /private", "Allow: /private/press",
    "User-agent: AvalonResearchBot", "Disallow: /admin", "Allow: /admin/info",
  ].join("\n");
  assert.equal(safety.robotsAllows(raw, "/admin/users"), false);
  assert.equal(safety.robotsAllows(raw, "/admin/info"), true);
  assert.equal(safety.robotsAllows(raw, "/public"), true);
  const universal = ["User-agent: *", "Disallow: /", "Allow: /public"].join("\n");
  assert.equal(safety.robotsAllows(universal, "/not-allowed"), false);
  assert.equal(safety.robotsAllows(universal, "/public/services"), true);
});

test("deep research selects no more than two safe same-origin information pages", () => {
  const paths = parser.chooseResearchPages(homepage, new URL(official + "/"));
  assert.equal(paths.length, 2);
  assert.ok(paths.every(x => x.startsWith(official)));
  assert.ok(paths.every(x => /book|contact|services/.test(x)));
});

test("verified site and cited signals never pretend hidden CRM/AI/marketing were investigated", () => {
  const report = parser.analyzeWebsitePages("Blue Harbor Dental", [
    fetched(homepage), fetched("<title>Contacts</title>", official + "/contact"),
  ], "2026-11-03T19:00:00.000Z");
  assert.equal(report.identity_matched, true);
  assert.equal(report.confidence, "medium");
  assert.equal(report.suggested_needs.length, 1);
  assert.equal(report.suggested_needs[0].service, "website");
  assert.equal(report.suggested_needs[0].state, "verified_present");
  assert.ok(report.unverified.some(s => s.includes("CRM")));
  assert.ok(report.unverified.some(s => s.includes("IA")));
  assert.ok(report.signals.every(f => f.source_url.startsWith(official)));
  assert.ok(report.signals.every(f => !!f.checked_at && !!f.detail));
  assert.ok(!report.suggested_needs.some(n => n.state === "verified_missing"));
});

test("missing title/website, errors and limited pages never invent a missing service", () => {
  const unmatched = parser.analyzeWebsitePages("Different Business", [fetched(homepage)],
    "2026-11-03T19:00:00.000Z");
  assert.equal(unmatched.identity_matched, false);
  assert.deepEqual(unmatched.suggested_needs, []);
  const unreachable = parser.analyzeWebsitePages("Blue Harbor Dental",
    [{ ...fetched(""), status: 0, contentType: "" }], "2026-11-03T19:00:00.000Z");
  assert.equal(unreachable.confidence, "none");
  assert.deepEqual(unreachable.suggested_needs, []);
  assert.equal(unreachable.signals[0].outcome, "unknown");
});

test("server workflow is owner gated, cached, limited and does not turn reports into pipeline leads", () => {
  const route = fs.readFileSync("src/app/admin/workspace/crm/radar/research/route.ts", "utf8");
  assert.match(route, /getOwnerSession/);
  assert.match(route, /MAX_DAILY_PER_OWNER = 12/);
  assert.match(route, /CACHE_MS = 24/);
  assert.match(route, /do_not_contact/);
  assert.match(route, /investigateOfficialWebsite/);
  assert.match(route, /crm_radar_research_reports/);
  assert.doesNotMatch(route, /crm_convert_prospect|service_role|SERVICE_ROLE/);
  const ui = fs.readFileSync("src/components/crm/titan-radar.tsx", "utf8");
  assert.match(ui, /<RadarResearchPanel/);
  const safetySource = fs.readFileSync("src/lib/crm/radar-website-safety.ts", "utf8");
  assert.match(safetySource, /lookup: \(_host, _options, callback\)/);
  assert.match(safetySource, /sameBusinessHost/);
  assert.match(safetySource, /checkRobots/);
});
