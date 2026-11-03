// Real PostgreSQL semantics in isolated PGlite. No network, production, or
// privileged remote services. Tests the SQL proposal rather than string checks.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const MACHINE = "00000000-0000-4000-8000-0000000000d4";
const OUTSIDER = "00000000-0000-4000-8000-0000000000e5";
const keyArgs = (overrides = {}) => ({
  module: "website", ref: "synthetic-site-2026-123", company: "Synthetic Dental LLC",
  lead: null, name: "Dental Preview", description: "Preview only",
  url: "https://preview.example.invalid", repository: "", owner: OWNER,
  agent: "codex", ...overrides,
});

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync("tests/sql/00_supabase_stub.sql", "utf8"));
  await db.exec(`insert into auth.users(id,email) values
    ('${OWNER}','owner@example.invalid'),('${MACHINE}','bridge@example.invalid'),
    ('${OUTSIDER}','outsider@example.invalid');`);
  for (const name of fs.readdirSync("supabase/migrations").filter(x => x.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${name}`, "utf8"));
    if (name.startsWith("20261102053022")) {
      await db.exec(`insert into agency_memberships(user_id,role)
        values ('${OWNER}','owner'),('${OUTSIDER}','operator');`);
    }
  }
  // Never apply this proposed SQL to a real Supabase project.
  await db.exec(fs.readFileSync("docs/sql/creative-bridge-registration.sql", "utf8"));
  await db.query(`insert into os_private.creative_bridge_identities (user_id,owner_id,enabled,label)
    values ($1::uuid,$2::uuid,true,'synthetic-bridge')`, [MACHINE, OWNER]);
  const as = async id => db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
  const one = async (sql, args) => (await db.query(sql, args)).rows[0];
  const num = async table => Number((await one(`select count(*)::int n from ${table}`)).n);
  const submit = async (v = {}) => {
    const p = keyArgs(v);
    const statement = `select public.os_receive_creative_delivery(
      $1::text,$2::text,$3::text,$4::uuid,$5::text,$6::text,
      $7::text,$8::text,$9::uuid,$10::text) receipt`;
    return (await one(statement, [p.module,p.ref,p.company,p.lead,p.name,p.description,
      p.url,p.repository,p.owner,p.agent])).receipt;
  };
  return { db, as, one, num, submit };
}

test("machine creates exactly one synthetic lead and product, with real audit actor", { timeout: 120000 }, async t => {
  const { db, as, one, num, submit } = await setup();
  t.after(() => db.close());
  await as(MACHINE);
  const result = await submit();
  assert.equal(result.created,true);
  assert.equal(result.lead_created,true);
  const replay = await submit();
  assert.equal(replay.created,false);
  assert.equal(replay.project_id,result.project_id);
  assert.equal(replay.lead_id,result.lead_id);
  assert.equal(await num("crm_leads"), 1);
  assert.equal(await num("os_projects"), 1);
  const lead = await one("select company, contact, email, source, owner_id, created_by, stage_id, value from crm_leads where id=$1", [result.lead_id]);
  assert.equal(lead.company,"Synthetic Dental LLC");
  assert.equal(lead.contact,"");
  assert.equal(lead.email,null);
  assert.equal(lead.owner_id,OWNER);
  assert.equal(lead.created_by,MACHINE);
  assert.equal(lead.stage_id,"new");
  assert.equal(Number(lead.value),0);
  const audit = await one("select actor_id, operation from crm_audit where record_id=$1", [result.lead_id]);
  assert.equal(audit.actor_id,MACHINE);
  assert.equal(audit.operation,"INSERT");
  const project = await one("select module,status,settings,created_by from os_projects where id=$1", [result.project_id]);
  assert.equal(project.module,"website");
  assert.equal(project.status,"draft");
  assert.equal(project.created_by,OWNER);
  assert.equal(project.settings.operations.client_lead_id,result.lead_id);
  assert.equal(project.settings.creative.external_ref,"synthetic-site-2026-123");
  assert.equal(project.settings.creative.state,"reference_only");
  assert.equal(await num("crm_sales"),0);
  await assert.rejects(submit({company:"Another Company"}), /source collision/);
  await assert.rejects(submit({name:"Different Site"}), /source collision/);
  assert.equal(await num("os_projects"),1);
  t.diagnostic("Database executed proposal SQL: unique replay, private machine audit, no sale.");
});

test("outsiders and owners cannot call the machine-only RPC, nor can machine write CRM directly", {timeout:120000},async t=>{
  const {db,as,submit,num} = await setup();t.after(()=>db.close());
  await as(OUTSIDER);
  await assert.rejects(submit(), /unapproved integration identity|permission denied/i);
  await as(OWNER);
  await assert.rejects(submit(), /unapproved integration identity|permission denied/i);
  await as(MACHINE);
  await assert.rejects(db.query(`insert into crm_leads(company,source,owner_id)
    values ('Forgery','manual','${OWNER}')`), /forbidden|policy|permission denied/i);
  await assert.rejects(db.query(`update crm_leads set company='Forgery'`), /policy|permission denied/i);
  await assert.rejects(db.query(`select * from os_private.creative_bridge_identities`), /permission denied/i);
  assert.equal(await num("crm_leads"),0);
  assert.equal(await num("os_projects"),0);
});

test("existing lead reused, exact existing customer linked to Client 360 without creating a sale", {timeout:120000},async t=>{
  const {db,as,one,submit,num}=await setup();t.after(()=>db.close());
  await as(OWNER);
  const lead=await one(`insert into crm_leads(company,source,owner_id)
    values ('Synthetic Dental LLC','Synthetic referral',$1::uuid) returning id`,[OWNER]);
  const client=await one(`insert into crm_clients(legal_name,trade_name,source,owner_id,origin_lead_id)
    values ('Synthetic Dental LLC','Synthetic Dental','Synthetic referral',$1::uuid,$2::uuid) returning id`,[OWNER,lead.id]);
  await as(MACHINE);
  const result=await submit({ref:"synthetic-site-existing-321"});
  assert.equal(result.lead_id,lead.id);
  assert.equal(result.lead_created,false);
  assert.equal(await num("crm_leads"),1);
  const project=await one("select client_id,settings from os_projects where id=$1",[result.project_id]);
  assert.equal(project.client_id,client.id);
  assert.equal(project.settings.operations.client_lead_id,lead.id);
  assert.equal(await num("crm_sales"),0);
});

test("ambiguous leads and client identities fail closed without orphan records", {timeout:120000},async t=>{
  const {db,as,one,submit,num}=await setup();t.after(()=>db.close());
  await as(OWNER);
  await db.exec(`insert into crm_leads(company,contact,source,owner_id)
    values ('Synthetic Dental LLC','A','Manual','${OWNER}'),
           ('synthetic dental llc','B','Manual','${OWNER}');`);
  const before=await num("crm_leads");
  await as(MACHINE);
  await assert.rejects(submit(),/ambiguous company identity/);
  assert.equal(await num("crm_leads"),before);
  assert.equal(await num("os_projects"),0);
  await as(OWNER);
  await db.exec(`insert into crm_clients(legal_name,trade_name,source,owner_id)
    values ('Synthetic Dental LLC','Brand A','Manual','${OWNER}'),
           ('Another Legal Business','Synthetic Dental LLC','Manual','${OWNER}');`);
  await as(MACHINE);
  await assert.rejects(submit({company:"Synthetic Dental LLC",ref:"another-source"}), /ambiguous company identity|ambiguous client identity/);
  assert.equal(await num("os_projects"),0);
  // A new name colliding with two customer trade identities rolls back the lead insert.
  await as(OWNER);
  await db.exec(`insert into crm_clients(legal_name,trade_name,source,owner_id)
    values ('Other Company','Ambiguous Brand','Manual','${OWNER}'),
           ('Second Company','Ambiguous Brand','Manual','${OWNER}');`);
  await as(MACHINE);
  const countBefore=await num("crm_leads");
  await assert.rejects(submit({company:"Ambiguous Brand",ref:"rolled-back-source"}),/ambiguous client identity/);
  assert.equal(await num("crm_leads"),countBefore);
  assert.equal(await num("os_projects"),0);
});

test("machine cannot impersonate arbitrary owner, change stage or write sales", {timeout:120000},async t=>{
  const {db,as,submit,num}=await setup();t.after(()=>db.close());
  await as(MACHINE);
  await assert.rejects(submit({owner:OUTSIDER}),/unapproved integration identity/);
  await assert.rejects(submit({module:"marketing"}),/invalid creative delivery/);
  await assert.rejects(submit({agent:"other"}),/invalid creative delivery/);
  assert.equal(await num("crm_leads"),0);
  assert.equal(await num("os_projects"),0);
});
