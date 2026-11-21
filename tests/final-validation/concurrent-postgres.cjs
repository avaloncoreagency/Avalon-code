'use strict';
// True concurrent PostgreSQL sessions, ONLY a disposable localhost CI service.
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
if (process.env.FINAL_VALIDATION_POSTGRES !== 'ephemeral' || process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'avalon_qa' || process.env.PGSERVICE || process.env.PGSERVICEFILE)
  throw Error('Refusing non-ephemeral database');
const env = { PATH: process.env.PATH, PGHOST: '127.0.0.1', PGPORT: process.env.PGPORT || '5432', PGDATABASE: 'avalon_qa', PGUSER: 'postgres', PGPASSWORD: process.env.PGPASSWORD, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c statement_timeout=20000' };
function sql(text) { const r = cp.spawnSync('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1'], { input: text, env, encoding: 'utf8' }); if (r.status) throw Error(r.stderr); return r.stdout.trim(); }
sql(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) sql(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
// The real function intentionally returns unavailable without an agency owner. Seed ONLY this disposable fixture.
sql("insert into auth.users(id) values('00000000-0000-4000-8000-000000000001'); insert into agency_memberships(user_id,role) values('00000000-0000-4000-8000-000000000001','owner');");
const request = message => JSON.stringify({ company: 'Concurrent Synthetic', name: 'QA Synthetic', email: 'concurrent@example.invalid', message, services: ['website'], language: 'es' });
const literal = s => "'" + s.replaceAll("'", "''") + "'";
function session(message) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1'], { env });
    let out = '', err = ''; p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b);
    p.on('error', reject); p.on('close', code => code ? reject(Error(err)) : resolve(out.trim()));
    p.stdin.end(`begin; set local role anon; select pg_sleep(0.4); select crm_public_inquiry(${literal(request(message))}::jsonb); commit;`);
  });
}
(async () => {
  for (const message of ['Concurrent identical synthetic request.', 'Different message from the same synthetic sender.']) {
    const responses = await Promise.all([session(message), session(message)]);
    responses.forEach(r => assert.match(r, /ok/));
  }
  assert.equal(sql('select count(*) from crm_prospects'), '1');
  assert.equal(sql('select count(*) from crm_public_inquiries'), '2');
  for (const t of ['crm_leads', 'crm_clients', 'crm_sales']) assert.equal(sql('select count(*) from ' + t), '0');
  console.log('PASS: four submissions, two concurrent pairs, one prospect/two messages/no fabricated sale');
  const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
  sql(`insert into auth.users(id) values('${b}');insert into agency_memberships(user_id,role) values('${b}','owner');`);
  const lead=sql(`set request.jwt.claim.sub='${a}';set role authenticated;insert into crm_leads(company,source,owner_id) values('Concurrent Synthetic Lead','manual','${a}') returning id;`).split('\n').find(x=>/^[a-f0-9-]{36}$/.test(x));
  assert.ok(lead,'synthetic versioned lead created');
  const ownerMove=(actor,stage)=>new Promise((resolve,reject)=>{
    const p=cp.spawn('psql',['-XAt','-v','ON_ERROR_STOP=1'],{env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>code?reject(Error(err)):resolve(out.trim().split('\n').filter(x=>/^[01]$/.test(x))));
    p.stdin.end(`begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';select pg_sleep(0.4);with changed as(update crm_leads set stage_id='${stage}' where id='${lead}' and version=1 returning id) select count(*) from changed;commit;`);
  });
  const raced=await Promise.all([ownerMove(a,'contacted'),ownerMove(b,'proposal')]);
  assert.ok(raced.every(r=>r.length===1));assert.deepEqual(raced.flat().sort(),['0','1']);
  assert.equal(sql(`select version from crm_leads where id='${lead}'`),'2');
  assert.equal(sql(`select count(*) from crm_lead_stage_history where lead_id='${lead}'`),'2');
  assert.equal(sql('select count(*) from crm_sales'),'0');
  console.log('PASS: two independent owner sessions, one version winner, one stale write, one history change, no sale');
})().catch(e => { console.error(e); process.exitCode = 1; });
