const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const exported = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/crm/business-day.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exported.exports, module: exported, Date, Intl, Number, RangeError, Error });
const { crmBusinessDayBounds, CRM_BUSINESS_TIME_ZONE } = exported.exports;

test("CRM uses the same Miami/Eastern business day even when UTC date is already tomorrow", () => {
  assert.equal(CRM_BUSINESS_TIME_ZONE, "America/New_York");
  const { start, end } = crmBusinessDayBounds(new Date("2026-11-16T04:30:00Z"));
  assert.equal(start, "2026-11-15T05:00:00.000Z");
  assert.equal(end, "2026-11-16T05:00:00.000Z");
});

test("spring DST shift creates a 23-hour business day", () => {
  const { start, end } = crmBusinessDayBounds(new Date("2026-03-08T12:00:00Z"));
  assert.equal(start, "2026-03-08T05:00:00.000Z");
  assert.equal(end, "2026-03-09T04:00:00.000Z");
  assert.equal(Date.parse(end) - Date.parse(start), 23 * 3600000);
});

test("autumn DST shift creates a 25-hour business day", () => {
  const { start, end } = crmBusinessDayBounds(new Date("2026-11-01T12:00:00Z"));
  assert.equal(start, "2026-11-01T04:00:00.000Z");
  assert.equal(end, "2026-11-02T05:00:00.000Z");
  assert.equal(Date.parse(end) - Date.parse(start), 25 * 3600000);
});

test("ordinary summer day is 24 hours and midnight belongs to next day only", () => {
  const { start, end } = crmBusinessDayBounds(new Date("2026-07-14T14:00:00Z"));
  assert.equal(start, "2026-07-14T04:00:00.000Z");
  assert.equal(end, "2026-07-15T04:00:00.000Z");
  assert.equal(Date.parse(end) - Date.parse(start), 24 * 3600000);
  assert.equal(crmBusinessDayBounds(new Date(end)).start, end);
});

test("both Pipeline and the advanced sales desk share the business-day helper", () => {
  const paths = ["src/components/crm/lead-workbench.tsx", "src/app/admin/workspace/crm/desk/page.tsx"];
  for (const path of paths) {
    const code = fs.readFileSync(path, "utf8");
    assert.match(code, /crmBusinessDayBounds\(now\)/, path);
    assert.match(code, /\.gte\("follow_up_at", start\)\.lt\("follow_up_at", end\)/, path);
  }
});

test("the mobile dock exposes Sales as a primary destination, alongside Pipeline and Clients", () => {
  const chrome = fs.readFileSync("src/components/suite/chrome.tsx", "utf8");
  assert.match(chrome, /const salesActive = pathname\.startsWith\("\/admin\/workspace\/crm\/sales"\)/);
  assert.match(chrome, /href="\/admin\/workspace\/crm\/sales" aria-current={salesActive \? "page" : undefined}/);
});
