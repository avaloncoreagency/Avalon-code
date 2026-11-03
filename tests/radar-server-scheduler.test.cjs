const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const STRANGER = "00000000-0000-4000-8000-0000000000c3";

test("Deno radar worker has a guarded secret, daily cap, lease and no outbound sales messaging", () => {
  const edge = fs.readFileSync("supabase/functions/avalon-radar-worker/index.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20261103205000_radar_scheduler_core.sql", "utf8");
  const bundleSource = fs.readFileSync("supabase/functions/avalon-radar-worker/radar-website-safety.ts", "utf8");
  const realSource = fs.readFileSync("src/lib/crm/radar-website-safety.ts", "utf8");
  assert.equal(bundleSource.slice(bundleSource.indexOf("\n") + 1), realSource,
    "Edge bundle must use the same vetted pinned-DNS safety as the web radar");
  assert.match(edge, /SUPABASE_SECRET_KEYS/);
  assert.match(edge, /sameHash\(supplied, config.token_sha256\)/);
  assert.match(edge, /MAX_DAILY_REPORTS = 12/);
  assert.match(edge, /MAX_PER_INVOCATION = 2/);
  assert.match(edge, /lease_until/);
  assert.match(edge, /investigateOfficialWebsite/);
  assert.match(edge, /report\.identity_matched/);
  assert.match(edge, /Number\(row\.stars\) >= 4 && row\.confidence === "high"/);
  assert.doesNotMatch(edge, /sendEmail|twilio|resend\.emails|sendSms/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\)/);
  assert.match(migration, /strong_services < 2/);
  assert.match(migration, /revoke all on function public\.crm_radar_worker_convert_verified/);
  const transpiled = ts.transpileModule(edge, {
    fileName: "supabase/functions/avalon-radar-worker/index.ts",
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  assert.deepEqual((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error), []);
});

test("dedicated worker state has private secrets and owner-only run history", { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec("insert into auth.users(id) values('" + MIGUEL + "'),('" + SAMUEL + "'),('" + STRANGER + "')");
  for (const file of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + file, "utf8"));
    if (file.startsWith("20261102053022"))
      await db.exec("insert into agency_memberships values('" + MIGUEL + "','owner'),('" +
        SAMUEL + "','owner'),('" + STRANGER + "','operator')");
  }
  const as = async (role, user) => {
    await db.exec("reset role;set request.jwt.claim.role='" + role + "';set request.jwt.claim.sub='" + user + "';set role " + role);
  };
  await as("authenticated", MIGUEL);
  const rows = (await db.query("select id,enabled,token_sha256 from crm_radar_worker_config")).rows;
  // Even owners must not be able to retrieve a worker secret hash.
  assert.fail("owner config should be inaccessible: " + JSON.stringify(rows));
});
