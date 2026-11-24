'use strict';
// Disposable PGlite only: no connection string, environment credentials or remote SQL.
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const OWNER = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000b2';
const CUTOFF = '20261121180000';
async function fixture(t, legacy = false) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',
    [OWNER, 'finance@example.invalid', OTHER, 'outsider@example.invalid']);
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  const apply = file => db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
  for (const file of files.filter(f => !legacy || f < CUTOFF)) {
    await apply(file);
    if (file.startsWith('20261102053022')) await db.query("insert into agency_memberships values($1,'owner'),($2,'operator')", [OWNER, OTHER]);
  }
  await db.query('insert into crm_private.finance_access(user_id) values($1)', [OWNER]);
  const as = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); };
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  await as(OWNER);
  const lead = (await one("insert into crm_leads(company,contact,source,owner_id) values('Isolated QA','QA','manual',$1) returning id", [OWNER])).id;
  const client = (await one("insert into crm_clients(legal_name,source,owner_id,origin_lead_id) values('Isolated QA LLC','manual',$1,$2) returning id", [OWNER, lead])).id;
  const term = (await one(`insert into crm_commercial_terms(lead_id,kind,billing_model,commission_pct,commission_base,commission_approved_by,attribution_rules,cancellation_terms,currency)
    values($1,'agreed','commission',5,'gross_revenue',$2,'Synthetic attribution','Synthetic exclusions','USD') returning id`, [lead, OWNER])).id;
  const contract = (await one("insert into crm_contracts(lead_id,title,terms_id) values($1,'QA contract',$2) returning id", [lead, term])).id;
  await db.query("update crm_contracts set status='sent_for_signature' where id=$1", [contract]);
  await db.query("update crm_contracts set status='signed_pending_verification',signed_at=now(),signer_name='Synthetic signer',external_reference='QA-CONTRACT' where id=$1", [contract]);
  await db.query("update crm_contracts set status='verified_signed',verification_method='document_review',verification_note='Synthetic document reviewed' where id=$1", [contract]);
  const record = async (ref, gross = '100.00', excluded = '0') => (await one('select crm_attribution_record($1::jsonb) id',
    [JSON.stringify({ client_id: client, source: 'Synthetic form', external_ref: ref, gross_collected: gross, excluded_amount: excluded })])).id;
  const advance = (id, to, version, evidence = 'Synthetic evidence') => db.query('select crm_attribution_advance($1,$2,$3,$4)', [id, to, evidence, version]);
  const row = id => one('select * from crm_attributed_conversions where id=$1', [id]);
  return { db, as, one, record, advance, row, client, upgrade: async () => {
    await db.exec('reset role'); for (const file of files.filter(f => f >= CUTOFF)) await apply(file); await as(OWNER);
  } };
}
module.exports = { fixture, OWNER, OTHER };
