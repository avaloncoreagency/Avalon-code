'use strict';
// True concurrent PostgreSQL sessions, ONLY a disposable localhost CI service.
const fs = require('node:fs'), cp = require('node:child_process'), assert = require('node:assert/strict');
if (process.env.FINAL_VALIDATION_POSTGRES !== 'ephemeral' || process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'avalon_qa' || process.env.PGSERVICE || process.env.PGSERVICEFILE)
  throw Error('Refusing non-ephemeral database');
const env = { PATH: process.env.PATH, PGHOST: '127.0.0.1', PGPORT: process.env.PGPORT || '5432', PGDATABASE: 'avalon_qa', PGUSER: 'postgres', PGPASSWORD: process.env.PGPASSWORD, PGCONNECT_TIMEOUT: '5', PGOPTIONS: '-c statement_timeout=20000' };
function sql(text) { const r = cp.spawnSync('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1'], { input: text, env, encoding: 'utf8' }); if (r.status) throw Error(r.stderr); return r.stdout.trim(); }
sql(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) sql(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
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
})().catch(e => { console.error(e); process.exitCode = 1; });
