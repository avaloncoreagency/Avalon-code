#!/usr/bin/env node
// Operation Phoenix · builds AND verifies the rollback for the 11 pending production migrations (no network, no data).
//  1. PGlite A = the 26 migrations production already has; PGlite B = A + the 11 pending migrations.
//  2. Diff the catalogs: new tables/functions/columns/indexes/triggers in B → drop; functions B replaced → restore A's definition + ACL.
//  3. Verify: apply the generated rollback on B; its fingerprint (comments ignored) and index list must equal A's.
// Usage: NODE_PATH=./tests/qa/node_modules node scripts/recovery/phoenix-batch-rollback.cjs > scripts/recovery/phoenix-batch-rollback.sql
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const PENDING = ['20261110140000', '20261111100000', '20261112'];
const SCHEMAS = "('public','crm_private','os_private')";
const boot = async (all) => {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, unique (bucket_id, name));`);
  // Start from production's real default privileges (pg_default_acl captured 2026-11-13), not the bare stub.
  await db.exec(`alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    if (!all && PENDING.some(p => f.startsWith(p))) continue;
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
  }
  // Fully qualified names in every generated statement (regclass/regprocedure print the schema when it is not on the path).
  await db.exec("set search_path = ''");
  return db;
};
const q = async (db, sql) => (await db.query(sql)).rows;
const tables = db => q(db, `select c.oid::regclass::text t from pg_class c where c.relkind in ('r','p','v') and c.relnamespace::regnamespace::text in ${SCHEMAS}`);
const funcs = db => q(db, `select p.oid::regprocedure::text sig, coalesce(p.proacl::text,'') acl, md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\\s+', ' ', 'g'))) h,
  pg_get_functiondef(p.oid) def from pg_proc p where p.prokind = 'f' and p.pronamespace::regnamespace::text in ${SCHEMAS}`);
const cols = db => q(db, `select c.oid::regclass::text t, a.attname col from pg_attribute a join pg_class c on c.oid = a.attrelid
  where c.relkind = 'r' and a.attnum > 0 and not a.attisdropped and c.relnamespace::regnamespace::text in ${SCHEMAS}`);
const idx = db => q(db, `select schemaname || '.' || indexname i, (quote_ident(schemaname) || '.' || quote_ident(tablename))::regclass::text t, indexdef from pg_indexes where schemaname in ${SCHEMAS}`);
const trg = db => q(db, `select c.oid::regclass::text t, t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace::regnamespace::text in ${SCHEMAS}`);
const fingerprint = async db => {
  const sql = fs.readFileSync('scripts/recovery/schema-fingerprint.sql', 'utf8');
  const fp = (await q(db, sql))[0].fingerprint;
  fp.functions = (await funcs(db)).map(f => f.sig + ' ' + f.h + ' ' + f.acl);
  fp.indexes = (await idx(db)).map(i => i.indexdef);
  fp.default_acl = (await q(db, `select defaclrole::regrole::text || ':' || coalesce(defaclnamespace::regnamespace::text,'*') || ':' || defaclobjtype::text || ':' || defaclacl::text a from pg_default_acl`)).map(r => r.a);
  for (const k of Object.keys(fp)) fp[k] = [...fp[k]].sort();
  return fp;
};
const aclToGrants = (sig, acl) => {
  const out = [`revoke all on function ${sig} from public, anon, authenticated, service_role;`];
  for (const m of acl.replace(/[{}]/g, '').split(',').filter(Boolean)) {
    const [who, rest] = m.split('='); if (!rest || !rest.startsWith('X')) continue;
    out.push(`grant execute on function ${sig} to ${who === '' ? 'public' : who};`);
  }
  return out;
};
(async () => {
  const A = await boot(false), B = await boot(true);
  const tA = new Set((await tables(A)).map(r => r.t)), tB = (await tables(B)).map(r => r.t);
  const newTables = tB.filter(t => !tA.has(t));
  const fA = new Map((await funcs(A)).map(f => [f.sig, f])), fB = await funcs(B);
  const newFuncs = fB.filter(f => !fA.has(f.sig)).map(f => f.sig);
  const bSigs = new Set(fB.map(f => f.sig));
  const changed = fB.filter(f => fA.has(f.sig) && (fA.get(f.sig).h !== f.h || fA.get(f.sig).acl !== f.acl)).map(f => f.sig);
  const removed = [...fA.keys()].filter(s => !bSigs.has(s));
  const cA = new Set((await cols(A)).map(r => r.t + '.' + r.col));
  const newCols = (await cols(B)).filter(r => tA.has(r.t) && !cA.has(r.t + '.' + r.col));
  const iA = new Set((await idx(A)).map(r => r.i));
  const newIdx = (await idx(B)).filter(r => !iA.has(r.i) && tA.has(r.t)).map(r => r.i);
  const trA = new Set((await trg(A)).map(r => r.t + '.' + r.tgname));
  const newTrg = (await trg(B)).filter(r => tA.has(r.t) && !trA.has(r.t + '.' + r.tgname));
  const L = [];
  L.push('-- Operation Phoenix · ROLLBACK of the 11 pending migrations (generated + verified by scripts/recovery/phoenix-batch-rollback.cjs).');
  L.push('-- Returns production to the 26-migration schema it had on 2026-11-13. Use ONLY if the batch must be undone.');
  L.push('-- WARNING: drops the new tables/columns, so anything written into them after the batch is lost. Existing data is untouched.');
  L.push('begin;');
  for (const t of newTrg) L.push(`drop trigger if exists ${t.tgname} on ${t.t};`);
  for (const i of newIdx) L.push(`drop index if exists ${i};`);
  for (const t of newTables) L.push(`drop table if exists ${t} cascade;`);
  for (const c of newCols) L.push(`alter table ${c.t} drop column if exists ${c.col};`);
  for (const f of newFuncs) L.push(`drop function if exists ${f} cascade;`);
  for (const s of [...changed, ...removed]) { L.push(fA.get(s).def.trim() + ';'); L.push(...aclToGrants(s, fA.get(s).acl)); }
  L.push(`alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;
alter default privileges for role postgres grant execute on functions to public;`);
  L.push('commit;');
  const sql = L.join('\n') + '\n';
  // Verify on B.
  const before = await fingerprint(A);
  await B.exec(sql);
  const after = await fingerprint(B);
  let diffs = 0;
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = new Set(before[k] ?? []), b = new Set(after[k] ?? []);
    const miss = [...a].filter(x => !b.has(x)), extra = [...b].filter(x => !a.has(x));
    if (miss.length || extra.length) { diffs++; console.error(`✖ ${k}: missing ${miss.length}, extra ${extra.length}`, miss.slice(0, 5), extra.slice(0, 5)); }
    else console.error(`✔ ${k}: ${a.size} equal after rollback`);
  }
  console.error(`summary: tables -${newTables.length}, functions -${newFuncs.length}, restored ${changed.length + removed.length}, columns -${newCols.length}, indexes -${newIdx.length}, triggers -${newTrg.length}`);
  if (diffs) { console.error('ROLLBACK NOT VERIFIED'); process.exit(1); }
  console.error('ROLLBACK VERIFIED: schema identical to the 26-migration state');
  process.stdout.write(sql);
  await A.close(); await B.close();
})();
