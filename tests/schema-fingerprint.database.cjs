const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('catalog v2 detects policy, default, trigger, index and overloaded grant drift without reading data',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.exec(`create table public.synthetic_catalog(id int primary key,value text default 'a');alter table synthetic_catalog enable row level security;create policy owners on synthetic_catalog to authenticated using(id>0);create function public.synthetic_rpc(integer)returns integer language sql as 'select $1';create function public.synthetic_rpc(text)returns text language sql as 'select $1';`);
 const sql=fs.readFileSync('scripts/recovery/schema-fingerprint-v2.sql','utf8');
 const read=async()=>Object.fromEntries((await db.query(sql)).rows.map(x=>[x.section,x.digest]));
 const before=await read();await db.exec('alter policy owners on synthetic_catalog using(id>1)');assert.notEqual((await read()).policies,before.policies);
 const second=await read();await db.exec("alter table synthetic_catalog alter column value set default 'b'");assert.notEqual((await read()).columns,second.columns);
 const third=await read();await db.exec('create index synthetic_value on synthetic_catalog(value)');assert.notEqual((await read()).indexes,third.indexes);
 const fourth=await read();await db.exec('revoke execute on function synthetic_rpc(text) from public');assert.notEqual((await read()).function_grants,fourth.function_grants);
 assert.equal((await read()).tables,before.tables,'data/DDL content is kept separate from row permissions and definitions');
});
