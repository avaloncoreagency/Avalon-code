// Browser -> Next Server Action -> Supabase JS -> synthetic HTTP -> real PGlite CRM.
// No external Supabase, Meta, voice, payments, customer data or production writes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const { chromium } = require("playwright");
const { startBridge } = require("./support/rest-bridge.cjs");

const OWNER = "00000000-0000-4000-8000-0000000000a1";

async function reservePort() {
  const s = createServer();
  await new Promise(r => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise(r => s.close(r));
  return port;
}

test("GROWTH HTTP E2E: public funnel captures a synthetic lead once, 390px responsive", { timeout: 230000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id) values('${OWNER}')`);
  for (const f of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("20261102053022"))
      await db.exec(`insert into agency_memberships(user_id,role) values('${OWNER}','owner')`);
  }
  // The funnel schema and its owner-approved anonymous grant now come from the migrations (20261112090000, 20261112110000).
  await db.exec(`insert into crm_growth_funnels
    (slug,title,subheading,cta,template,status,created_by)
    values ('http-capture-demo','Captación HTTP Sintética','Un registro de prueba','Solicitar información','capture','active','${OWNER}')`);
  const bridge = await startBridge(db, { users: new Map() });
  t.after(() => bridge.close());

  const port = await reservePort();
  const origin = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port)], {
    env: {
      ...process.env, APP_ORIGIN: origin,
      GH_TOKEN: "", GITHUB_TOKEN: "", BRIDGE_GITHUB_TOKEN: "",
      NEXT_PUBLIC_SUPABASE_URL: bridge.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", chunk => { log = (log + chunk).slice(-5000); });
  child.stderr.on("data", chunk => { log = (log + chunk).slice(-5000); });
  t.after(async () => {
    child.kill();
    if (child.exitCode === null) await new Promise(r => child.once("exit", r));
  });
  let online = false;
  for (let i = 0; i < 120; i++) {
    try { online = (await fetch(origin + "/")).ok; } catch { /* retry */ }
    if (online) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(online, "Next server failed: " + log);

  const draft = await fetch(origin + "/f/unlisted-draft", { redirect: "manual" });
  assert.equal(draft.status, 404, "non-published funnel must fail closed");
  const direct = await fetch(origin + "/f/http-capture-demo", { redirect: "manual" });
  assert.equal(direct.status, 200);
  assert.match(await direct.text(), /Captación HTTP Sintética/);

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin + "/f/http-capture-demo");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    "mobile layout must not overflow");
  const fill = async () => {
    await page.getByLabel("Empresa").fill("Orbit Synthetic LLC");
    await page.getByLabel("Tu nombre").fill("Ana Prueba");
    await page.getByLabel("Correo electrónico").fill("ana@orbit.example.invalid");
    await page.getByLabel("¿Qué te gustaría lograr?").fill("Quiero un funnel y un chatbot para mi negocio.");
    await page.getByRole("checkbox").check();
  };
  await fill();
  await page.getByRole("button", { name: "Solicitar información" }).click();
  await page.getByRole("status").getByText("Solicitud recibida").waitFor({ timeout: 15000 });
  await page.reload();
  await fill();
  await page.getByRole("button", { name: "Solicitar información" }).click();
  await page.getByRole("status").getByText("Solicitud recibida").waitFor({ timeout: 15000 });
  assert.deepEqual(errors, [], "browser must have no page exceptions");

  await db.exec("reset role");
  const leads = (await db.query("select id,company,email,source,stage_id from crm_leads")).rows;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].company, "Orbit Synthetic LLC");
  assert.equal(leads[0].stage_id, "new");
  assert.equal(leads[0].source, "Funnel: http-capture-demo");
  assert.equal(Number((await db.query("select count(*)::int n from crm_growth_funnel_submissions")).rows[0].n), 1);
  assert.equal(Number((await db.query("select count(*)::int n from crm_sales")).rows[0].n), 0);
  assert.equal(Number((await db.query("select count(*)::int n from crm_events")).rows[0].n), 0);
});
