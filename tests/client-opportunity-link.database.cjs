// Isolated PostgreSQL (PGlite) validation of reviewed SQL. Synthetic records ONLY.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const verifiedContract = require('./helpers/verified-contract.cjs');

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const SECOND = '00000000-0000-4000-8000-0000000000b2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000c3';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
  await db.exec(`insert into auth.users(id,email) values
    ('${OWNER}','owner@example.invalid'),('${SECOND}','second@example.invalid'),('${OUTSIDER}','outsider@example.invalid')`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role)
      values('${OWNER}','owner'),('${SECOND}','owner'),('${OUTSIDER}','operator')`);
  }
  // Migration crm_client_opportunity_registration is already applied by the ordered migration loop.
  const as = u => db.exec(`reset role; set request.jwt.claim.sub='${u}'; set role authenticated;`);
  const one = async (sql,p) => (await db.query(sql,p)).rows[0];
  const n = async (sql,p) => Number((await one(sql,p)).n);
  return {db,as,one,n};
}

test('manual client creation atomically links New lead but creates no sale', {timeout:180000}, async t => {
  const {db,as,one,n}=await setup();
  t.after(()=>db.close());
  await as(OWNER);
  const request={legal_name:'Synthetic Barber Co',trade_name:'Barber Studio',source:'Pilot',
    website:'https://barber.example.invalid',industry:'Barbershop'};
  const created=(await one('select public.crm_register_client_with_opportunity($1::jsonb) r',[JSON.stringify(request)])).r;
  assert.ok(created.client_id && created.lead_id);
  const client=await one('select id,origin_lead_id,trade_name from crm_clients where id=$1',[created.client_id]);
  const lead=await one('select id,stage_id,company from crm_leads where id=$1',[created.lead_id]);
  assert.equal(client.origin_lead_id,lead.id);
  assert.equal(lead.stage_id,'new');
  assert.equal(lead.company,'Barber Studio');
  assert.equal(await n('select count(*) n from crm_sales'),0);
  assert.equal(await n('select count(*) n from os_projects'),0);
  await assert.rejects(db.query('select public.crm_register_client_with_opportunity($1::jsonb)',
    [JSON.stringify(request)]),/sale_client_exists/);
  assert.equal(await n('select count(*) n from crm_clients'),1);
  assert.equal(await n('select count(*) n from crm_leads'),1);
  await as(SECOND);
  assert.equal(await n('select count(*) n from crm_clients'),1);
  await as(OUTSIDER);
  await assert.rejects(db.query('select public.crm_register_client_with_opportunity($1::jsonb)',
    [JSON.stringify({legal_name:'Unauthorized'})]),/crm_forbidden/);
  assert.equal(await n('select count(*) n from crm_clients'),0,'RLS denies outsider');
});

test('existing client gets one idempotent opportunity and confirmed sale moves it to Won', {timeout:180000}, async t => {
  const {db,as,one,n}=await setup();
  t.after(()=>db.close());
  await as(OWNER);
  const company=await one(`insert into crm_clients(legal_name,trade_name,source,owner_id)
    values('Pilot Salon','Pilot Barber','Manual','${OWNER}') returning id`);
  const first=await one('select public.crm_ensure_client_opportunity($1) lead_id',[company.id]);
  const second=await one('select public.crm_ensure_client_opportunity($1) lead_id',[company.id]);
  assert.equal(first.lead_id,second.lead_id);
  assert.equal(await n('select count(*) n from crm_leads'),1);
  assert.equal((await one('select stage_id from crm_leads where id=$1',[first.lead_id])).stage_id,'new');
  assert.equal(await n('select count(*) n from crm_sales'),0);
  await verifiedContract(db,first.lead_id);
  const sale=(await one('select public.crm_confirm_sale($1::jsonb) r',[JSON.stringify({
    idempotency_key:'90000000-0000-4000-8000-000000000001',client_id:company.id,
    lead_id:first.lead_id,seller_id:OWNER,
    lines:[{service_code:'desarrollo-web',unit_price:'250.00'}]})])).r;
  assert.equal(sale.client_id,company.id);
  assert.equal((await one('select stage_id from crm_leads where id=$1',[first.lead_id])).stage_id,'won');
  assert.equal(await n('select count(*) n from crm_sales where client_id=$1',[company.id]),1);
  assert.equal(await n('select count(*) n from os_projects where client_id=$1',[company.id]),1);
  await as(OUTSIDER);
  await assert.rejects(db.query('select public.crm_ensure_client_opportunity($1)',[company.id]),/crm_forbidden/);
});

test('existing lead conflict blocks guessing client identity', {timeout:180000}, async t => {
  const {db,as,one,n}=await setup();
  t.after(()=>db.close());await as(OWNER);
  const c=await one(`insert into crm_clients(legal_name,source,owner_id) values('Name Conflict LLC','Manual','${OWNER}') returning id`);
  await db.query(`insert into crm_leads(company,contact,source,owner_id)
    values('Name Conflict LLC','', 'Manual','${OWNER}')`);
  await assert.rejects(db.query('select public.crm_ensure_client_opportunity($1)',[c.id]),/crm_existing_lead_review/);
  assert.equal((await one('select origin_lead_id from crm_clients where id=$1',[c.id])).origin_lead_id,null);
  assert.equal(await n('select count(*) n from crm_leads'),1);
});

test('V5 acceptance: "Chino Barber Demo" created in Clients 360 shows exactly one New lead and zero sales/invoices/contracts/payments', {timeout:180000}, async t => {
  const {db,as,one,n}=await setup();
  t.after(()=>db.close());
  await as(OWNER);
  const req={legal_name:'Chino Barber Demo LLC',trade_name:'Chino Barber Demo',source:'Registro manual',industry:'Barbershop'};
  const created=(await one('select public.crm_register_client_with_opportunity($1::jsonb) r',[JSON.stringify(req)])).r;
  const lead=await one('select stage_id,company from crm_leads where id=$1',[created.lead_id]);
  assert.equal(lead.stage_id,'new');
  assert.equal((await one('select origin_lead_id from crm_clients where id=$1',[created.client_id])).origin_lead_id,created.lead_id);
  assert.equal(await n("select count(*) n from crm_leads where company='Chino Barber Demo'"),1);
  for (const table of ['crm_sales','crm_invoices','crm_payments','crm_contracts','crm_commissions','crm_attributed_conversions','os_projects']) {
    const exists=await one("select to_regclass('public.'||$1) is not null e",[table]);
    if (exists.e) assert.equal(await n(`select count(*) n from ${table}`),0,`${table}: creating a client is not closing a sale`);
  }
  // Same company again (case-insensitive) is a duplicate, never a second lead.
  await assert.rejects(db.query('select public.crm_register_client_with_opportunity($1::jsonb)',[JSON.stringify({...req,legal_name:'chino barber demo llc'})]),/sale_client_exists/);
  assert.equal(await n('select count(*) n from crm_leads'),1);
});

test('client creation fails closed: no client-only insert fallback that leaves an orphan without a lead', () => {
  const actions=fs.readFileSync('src/app/admin/workspace/crm/clients/actions.ts','utf8');
  const create=actions.slice(actions.indexOf('export async function createClientRecord'),actions.indexOf('export async function ensureClientOpportunity'));
  assert.match(create,/crm_register_client_with_opportunity/);
  assert.doesNotMatch(create,/from\("crm_clients"\)\.insert/,'no silent orphan client');
  assert.match(create,/"schema_pending"/);
});

test('V5 Phase 4: a sale for company A cannot close the opportunity of company B (DB guard, even via direct RPC)', {timeout:180000}, async t => {
  const {db,as,one,n}=await setup();
  t.after(()=>db.close());
  await as(OWNER);
  const a=(await one('select public.crm_register_client_with_opportunity($1::jsonb) r',[JSON.stringify({legal_name:'Alpha Roofing Demo'})])).r;
  const b=(await one('select public.crm_register_client_with_opportunity($1::jsonb) r',[JSON.stringify({legal_name:'Beta Fencing Demo'})])).r;
  await verifiedContract(db,b.lead_id);
  await as(OWNER);
  const sale=(lead,key)=>db.query('select public.crm_confirm_sale($1::jsonb) r',[JSON.stringify({
    idempotency_key:key,client_id:a.client_id,lead_id:lead,seller_id:OWNER,lines:[{service_code:'desarrollo-web',unit_price:'100.00'}]})]);
  await assert.rejects(sale(b.lead_id,'90000000-0000-4000-8000-0000000000a1'),/sale_lead_other_client/);
  assert.equal((await one('select stage_id from crm_leads where id=$1',[b.lead_id])).stage_id,'new','B stays untouched');
  assert.equal(await n('select count(*) n from crm_sales'),0,'nothing stored (rolled back)');
  // A's own opportunity is accepted (with its verified contract).
  await verifiedContract(db,a.lead_id);
  await as(OWNER);
  const ok=(await one('select public.crm_confirm_sale($1::jsonb) r',[JSON.stringify({
    idempotency_key:'90000000-0000-4000-8000-0000000000a2',client_id:a.client_id,lead_id:a.lead_id,seller_id:OWNER,
    lines:[{service_code:'desarrollo-web',unit_price:'100.00'}]})])).r;
  assert.equal(ok.client_id,a.client_id);
  assert.equal((await one('select stage_id from crm_leads where id=$1',[a.lead_id])).stage_id,'won');
  // Moving that sale to company B later is also rejected.
  await assert.rejects(db.query('update crm_sales set client_id=$1 where id=$2',[b.client_id,ok.sale_id]),/sale_lead_other_client|permission denied|42501/);
});

test('V5 Phase 4: the server action rejects a foreign opportunity with a specific message, and the form shows only the client\'s own', () => {
  const action=fs.readFileSync('src/app/admin/workspace/crm/sales/actions.ts','utf8');
  const page=fs.readFileSync('src/app/admin/workspace/crm/sales/new/page.tsx','utf8');
  const form=fs.readFileSync('src/components/sales/sale-form.tsx','utf8');
  assert.match(action,/request\.lead_id !== canonicalLead\) \{\s*return \{ error: "sale_lead_other_client"/);
  assert.match(action,/if \(!request\.lead_id && canonicalLead\) request\.lead_id = canonicalLead/);
  assert.match(page,/const freeLeads = leadChoices\.filter\(l => !ownedLeads\.has\(l\.id\)/);
  assert.match(form,/selected\.lead \? <><input type="hidden" name="lead_id" value=\{selected\.lead\.id\} \/>/);
});
