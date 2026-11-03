// Pipeline board data rules: stage history by trigger, attachments limits and RLS. Synthetic data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2', OUT = '00000000-0000-4000-8000-0000000000c3';
test('pipeline board: stage history is automatic and tamper-proof; attachments are bounded and owner-only', { timeout: 120000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id) values('${MIGUEL}'),('${SAMUEL}'),('${OUT}');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OUT}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const q = async (s, p) => (await db.query(s, p)).rows;
  await as(MIGUEL);
  const [lead] = await q(`insert into crm_leads(company,source,owner_id,value) values('Board Sintético','web',$1,2500) returning id`, [MIGUEL]);
  await as(SAMUEL);
  await db.query("update crm_leads set stage_id='contacted' where id=$1", [lead.id]);
  await db.query("update crm_leads set value=3000 where id=$1", [lead.id]);
  await db.query("update crm_leads set stage_id='proposal' where id=$1", [lead.id]);
  const hist = await q('select from_stage, to_stage, actor_id from crm_lead_stage_history where lead_id=$1 order by id', [lead.id]);
  assert.deepEqual(hist.map(h => [h.from_stage, h.to_stage]), [[null, 'new'], ['new', 'contacted'], ['contacted', 'proposal']], 'only stage changes are recorded');
  assert.equal(hist[2].actor_id, SAMUEL);
  await assert.rejects(db.query("insert into crm_lead_stage_history(lead_id,to_stage) values($1,'won')", [lead.id]), /permission denied/);
  await assert.rejects(db.query('update crm_lead_stage_history set to_stage=$1', ['won']), /permission denied/);
  const pdf = Buffer.from('%PDF-1.4 sintético');
  const sha = require('node:crypto').createHash('sha256').update(pdf).digest('hex');
  await db.query('insert into crm_attachments(lead_id,filename,mime,size_bytes,sha256,content) values($1,$2,$3,$4,$5,$6)', [lead.id, 'propuesta.pdf', 'application/pdf', pdf.length, sha, pdf]);
  await assert.rejects(db.query('insert into crm_attachments(lead_id,filename,mime,size_bytes,sha256,content) values($1,$2,$3,$4,$5,$6)', [lead.id, 'x.html', 'text/html', pdf.length, sha, pdf]), /check/, 'mime allowlist');
  await assert.rejects(db.query('insert into crm_attachments(lead_id,filename,mime,size_bytes,sha256,content) values($1,$2,$3,$4,$5,$6)', [lead.id, '../etc.pdf', 'application/pdf', pdf.length, sha, pdf]), /check/, 'no path in filename');
  await assert.rejects(db.query('update crm_attachments set filename=$1', ['x.pdf']), /permission denied/, 'attachments immutable');
  const [att] = await q('select created_by, filename from crm_attachments');
  assert.equal(att.created_by, SAMUEL);
  await as(OUT);
  for (const tbl of ['crm_lead_stage_history', 'crm_attachments']) assert.equal((await q(`select count(*)::int n from ${tbl}`))[0].n, 0, tbl);
});
