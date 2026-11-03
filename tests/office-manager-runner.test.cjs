const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function loadPureTs(filename, deps = {}) {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    mod, mod.exports, id => {
      if (!(id in deps)) throw Error("untrusted_import:" + id);
      return deps[id];
    },
  );
  return mod.exports;
}
const jobs = loadPureTs("src/lib/office/manager-work.ts");
const { SAFE_OFFICE_COMMAND, workerRunKey, executeWorkerRun } = loadPureTs("src/lib/office/manager-worker.ts", {
  "./manager-work": jobs,
});
const poller = require("../scripts/office-manager-staging-poll.cjs");
const date = new Date("2026-11-03T21:06:00Z");
const token = "b".repeat(38);

test("exactly five jobs can be processed hourly without unsafe free-form commands", () => {
  assert.deepEqual([...poller.CODES], ["ren", "shin", "haru", "sora", "kenji"]);
  assert.equal(SAFE_OFFICE_COMMAND, "AVALON_MANAGER_CHECK_V1");
  assert.equal(workerRunKey("ren", "scheduled", date, null), "scheduled:ren:2026-11-03T21");
  assert.equal(workerRunKey("haru", "requested", date, "60a6b110-49ba-4725-b03a-26058c0d668a"),
    "request:60a6b110-49ba-4725-b03a-26058c0d668a");
  assert.throws(() => workerRunKey("ren", "requested", date, "untrusted free text"));
  assert.throws(() => workerRunKey("unknown", "scheduled", date, null));
});

test("atomic claim prevents repeated job execution in same hour", async () => {
  const used = new Set();
  let counted = 0, finishes = 0;
  const store = {
    claim: async key => {
      if (used.has(key)) return null;
      used.add(key);
      return "60a6b110-49ba-4725-b03a-26058c0d668a";
    },
    finish: async () => { finishes++; return true; },
  };
  const reader = async () => { counted++; return 4; };
  const first = await executeWorkerRun("ren", "scheduled", null, store, reader, date);
  const second = await executeWorkerRun("ren", "scheduled", null, store, reader, date);
  assert.equal(first.status, "completed");
  assert.equal(second.status, "duplicate");
  assert.equal(finishes, 1);
  assert.equal(counted, jobs.MANAGER_JOBS.ren.specs.length);
});

test("failed database work is recorded as failed without leaking error details", async () => {
  const persisted = [];
  const store = {
    claim: async () => "60a6b110-49ba-4725-b03a-26058c0d668a",
    finish: async (...args) => { persisted.push(args); return true; },
  };
  const r = await executeWorkerRun("shin", "scheduled", null, store,
    async () => { throw Error("database secret or private customer details"); }, date);
  assert.equal(r.status, "failed");
  assert.equal(persisted[0][2], "failed");
  assert.equal(persisted[0][3], null);
  assert.equal(persisted[0][4], "check_unavailable");
  assert.ok(!JSON.stringify(persisted).includes("database secret"));
});

test("a stolen/expired lease cannot persist a result", async () => {
  const store = {
    claim: async () => "60a6b110-49ba-4725-b03a-26058c0d668a",
    finish: async () => false,
  };
  await assert.rejects(() => executeWorkerRun("sora", "scheduled", null, store, async () => 0, date), /lease_lost/);
});

test("the GitHub runner permits only a verified HTTPS vercel.app Preview host", () => {
  assert.equal(poller.previewEndpoint("https://avalon-test-branch-avalon.vercel.app/"),
    "https://avalon-test-branch-avalon.vercel.app/api/internal/office-manager-runner");
  for (const url of [
    "https://avaloncoreagency.com", "http://avalon-test.vercel.app",
    "https://vercel.app", "https://vercel.app.attacker.test",
    "https://user:pass@avalon-test.vercel.app", "https://avalon-test.vercel.app/other",
    "https://avalon-test.vercel.app?token=secret", "http://localhost:3000",
  ]) assert.throws(() => poller.previewEndpoint(url));
  assert.deepEqual(poller.chooseManagers("all"), [...poller.CODES]);
  assert.deepEqual(poller.chooseManagers("ren"), ["ren"]);
  assert.throws(() => poller.chooseManagers("attacker"));
});

test("all five workers send only allowlisted job IDs, no client information", async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    const body = JSON.parse(options.body);
    return { ok: true, status: 200,
      json: async () => ({ manager: body.manager, scheduled: "completed", processed: 0, failures: 0 }) };
  };
  const result = await poller.runStagingManagers({
    baseUrl: "https://staging-avalon.vercel.app", token, fetcher: fakeFetch,
  });
  assert.equal(result.length, 5);
  assert.ok(result.every(x => x.ok));
  assert.deepEqual(calls.map(x => JSON.parse(x.options.body).manager), [...poller.CODES]);
  assert.ok(calls.every(c => c.options.headers.authorization === "Bearer " + token));
  assert.ok(calls.every(c => c.options.redirect === "error"));
  assert.ok(!JSON.stringify(result).includes(token));
});

test("transport failures remain visible and do not stop other managers", async () => {
  const res = await poller.runStagingManagers({
    baseUrl: "https://staging-avalon.vercel.app", token,
    fetcher: async (_, opts) => {
      const code = JSON.parse(opts.body).manager;
      if (code === "haru") throw Error("hidden token " + token);
      return { ok: true, status: 200,
        json: async () => ({ manager: code, scheduled: "completed", processed: 0, failures: 0 }) };
    },
  });
  assert.equal(res.length, 5);
  assert.deepEqual(res.filter(x => !x.ok).map(x => x.manager), ["haru"]);
  assert.ok(!JSON.stringify(res).includes(token));
});

test("the worker API is fail-closed and never runs on production", () => {
  const route = fs.readFileSync("src/app/api/internal/office-manager-runner/route.ts", "utf8");
  assert.match(route, /VERCEL_ENV !== "preview"/);
  assert.match(route, /PROD_SUPABASE_REF/);
  assert.match(route, /sameSecret\(provided, settings\.workerToken\)/);
  assert.match(route, /SAFE_OFFICE_COMMAND/);
  assert.match(route, /office_manager_claim_run/);
  assert.match(route, /office_manager_finish_run/);
  assert.doesNotMatch(route, /\\.insert\\(|\\.delete\\(|\\.update\\(/);
});

test("migration protects stored results with owner-read RLS and service-only writes", () => {
  const sql = fs.readFileSync("supabase/migrations/20261103211000_office_manager_runs.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /grant select on public\.office_manager_runs to authenticated/);
  assert.match(sql, /grant select, insert, update on public\.office_manager_runs to service_role/);
  assert.match(sql, /grant execute on function public\.office_manager_claim_run[\s\S]*to service_role/);
  assert.match(sql, /for select to authenticated using \(\(select crm_private\.is_owner\(\)\)\)/);
  assert.match(sql, /where r\.id = p_request_id and r\.agent = p_manager/);
  assert.match(sql, /r\.body = 'AVALON_MANAGER_CHECK_V1'/);
  assert.match(sql, /claim_token = p_token/);
  assert.match(sql, /lease_until > now\(\)/);
});
