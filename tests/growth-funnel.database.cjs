// AVALON GROWTH 001 — real isolated PostgreSQL semantics with synthetic identities.
// Never connects to Supabase production, Higgsfield, Meta, an email or telephony API.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const MIGUEL = "00000000-0000-4000-8000-0000000000a1";
const SAMUEL = "00000000-0000-4000-8000-0000000000b2";
const OUTSIDER = "00000000-0000-4000-8000-0000000000c3";

test("GROWTH E2E: public form -> a single audited CRM lead; no sale, outreach or appointment", { timeout: 120000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${OUTSIDER}')`);
  for (const f of fs.readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync("supabase/migrations/" + f, "utf8"));
    if (f.startsWith("20261102053022"))
      await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OUTSIDER}','operator')`);
  }
  await db.exec(fs.readFileSync("docs/sql/growth-funnel-prototype.sql", "utf8"));

  const as = async (role, user = "") => {
    await db.exec("reset role; set request.jwt.claim.sub='" + user + "'; set role " + role + ";");
  };
  const submit = async payload =>
    (await db.query("select public.crm_growth_funnel_submit($1::jsonb) as result", [JSON.stringify(payload)])).rows[0].result;
  const view = async slug =>
    (await db.query("select public.crm_growth_funnel_view($1) as result", [slug])).rows[0].result;

  await as("authenticated", MIGUEL);
  const create = async (slug, template, status = "active") => {
    return (await db.query(
      "insert into crm_growth_funnels(slug,title,subheading,cta,template,status) values($1,$2,$3,$4,$5,$6) returning id",
      [slug, "Funnel Sintético " + template, "Sin ventas ni contactos", "Enviar solicitud", template, status]
    )).rows[0].id;
  };
  const draft = await create("no-published-preview", "capture", "draft");
  const capture = await create("capture-demo-001", "capture");
  const sale = await create("sales-demo-001", "sales");
  const appointment = await create("appointments-demo-001", "appointments");
  assert.ok(draft && capture && sale && appointment);

  await as("anon");
  assert.equal(await view("no-published-preview"), null, "unpublished/draft is invisible");
  const publicView = await view("capture-demo-001");
  assert.equal(publicView.template, "capture");
  assert.equal(publicView.cta, "Enviar solicitud");
  assert.deepEqual(Object.keys(publicView).sort(), ["cta","slug","subheading","template","title"].sort());
  await assert.rejects(db.query("select id from crm_growth_funnels"), /permission denied|policy/i);
  await assert.rejects(db.query("select id from crm_growth_funnel_submissions"), /permission denied|policy/i);
  await assert.rejects(db.query("select id from crm_leads"), /permission denied|policy/i);
  await assert.rejects(db.query("insert into crm_leads(company,source,owner_id) values('bot','bot',$1)", [MIGUEL]), /permission denied|policy/i);

  const base = { slug: "capture-demo-001", company: "Orbit Synthetic LLC", name: "Ana Prueba", email: "ana@orbit.example.invalid", phone: "", message: "Solicito información sobre automatizaciones", consent: true };
  assert.equal(await submit({ ...base, consent: false }), "invalid", "consent is mandatory");
  assert.equal(await submit({ ...base, email: "not-an-email" }), "invalid");
  assert.equal(await submit({ ...base, message: "short" }), "invalid");
  assert.equal(await submit({ ...base, slug: "no-published-preview" }), "unavailable", "draft cannot receive leads");
  assert.equal(await submit({ ...base, website_url: "filled-by-bot" }), "ok", "honeypot does not reveal detection");
  assert.equal(await submit(base), "ok", "FIRST REAL SYNTHETIC LEAD");
  assert.equal(await submit({ ...base, email: "ANA@ORBIT.EXAMPLE.INVALID" }), "ok", "replay must be idempotent");
  assert.equal(await submit({ ...base, slug: "sales-demo-001" }), "ok", "sales template creates no sale");
  assert.equal(await submit({ ...base, slug: "appointments-demo-001" }), "ok", "appointment template does not book");
  // Active, separate fourth funnel: the global per-email cap still holds.
  await as("authenticated", SAMUEL);
  await create("fourth-demo-001", "capture");
  await as("anon");
  assert.equal(await submit({ ...base, slug: "fourth-demo-001" }), "throttled");

  await db.exec("reset role;");
  const leads = (await db.query("select id,company,contact,email,source,owner_id,created_by,stage_id from crm_leads")).rows;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].company, "Orbit Synthetic LLC");
  assert.equal(leads[0].source, "Funnel: capture-demo-001");
  assert.equal(leads[0].stage_id, "new");
  assert.equal(leads[0].created_by, MIGUEL, "CRM audit tracks owner identity, not anonymous visitor");
  assert.equal(leads[0].owner_id, MIGUEL);
  const submissions = (await db.query("select funnel_id,lead_id,consent_at from crm_growth_funnel_submissions")).rows;
  assert.equal(submissions.length, 3);
  assert.ok(submissions.every(x => x.lead_id === leads[0].id && x.consent_at));
  assert.equal(Number((await db.query("select count(*)::int n from crm_audit where entity='crm_leads'")).rows[0].n), 1);
  for (const table of ["crm_sales", "crm_clients", "crm_events"]) {
    assert.equal(Number((await db.query(`select count(*)::int n from ${table}`)).rows[0].n), 0, table + " must stay empty");
  }
  // Existing CRM pipeline creates ONE internal pending follow-up when a lead enters New.
  // This is a task row, NOT a sent email, booked appointment or outbound call.
  const activities = (await db.query(
    "select lead_id,kind,status,body from crm_activities order by created_at"
  )).rows;
  assert.equal(activities.length, 1, "existing CRM New-stage trigger creates one internal follow-up");
  assert.equal(activities[0].lead_id, leads[0].id);
  assert.equal(activities[0].kind, "system");
  assert.equal(activities[0].status, "pending");
  assert.match(activities[0].body, /Seguimiento automático/);

  await as("authenticated", SAMUEL);
  assert.equal(Number((await db.query("select count(*)::int n from crm_growth_funnel_submissions")).rows[0].n), 3,
    "second owner sees the same CRM intake");
  await as("authenticated", OUTSIDER);
  assert.equal(Number((await db.query("select count(*)::int n from crm_growth_funnel_submissions")).rows[0].n), 0);
  await assert.rejects(db.query(
    "insert into crm_growth_funnels(slug,title,template) values('bad-funnel','Unauthorized','capture')"
  ), /permission denied|policy/i);
});
