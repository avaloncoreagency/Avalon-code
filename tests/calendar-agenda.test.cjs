const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("src/app/admin/workspace/crm/calendar/page.tsx", "utf8");

test("calendar agenda limits leads to open stages before applying the page cap", () => {
  assert.match(page, /select\("id,company,follow_up_at,owner_id,crm_stages!inner\(kind\)"\)/);
  assert.match(page, /\.eq\("archived", false\)\.eq\("crm_stages\.kind", "open"\)/);
  assert.match(page, /run<\{ id: string; company: string; follow_up_at: string; owner_id: string \}\[]>\(leads\.limit\(200\)\)/);
});

test("calendar failures include tasks, deliveries, and lead queries", () => {
  assert.match(page, /const failed = t\.error \?\? o\.error \?\? l\.error;/);
  assert.match(page, /La agenda está incompleta/);
  assert.doesNotMatch(page, /solo se muestran seguimientos de leads/);
});

test("calendar never reports an empty period when a required query failed", () => {
  assert.match(page, /byDay\.size === 0 \? !failed &&/);
});

test("owner-scoped and all-owner follow-up filters remain in place", () => {
  assert.match(page, /if \(who\) \{ tasks = tasks\.eq\("assignee_id", who\); orders = orders\.eq\("assignee_id", who\); leads = leads\.eq\("owner_id", who\); \}/);
  assert.match(page, /q\(p, "owner"\) === "all"/);
});
