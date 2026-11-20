// Protocol regression with the real pinned Supabase client, PGlite roles/RLS and the existing synthetic HTTP bridge.
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');const {createClient}=require('@supabase/supabase-js');const {startBridge}=require('./support/rest-bridge.cjs');
const A='00000000-0000-4000-8000-0000000000a1',B='00000000-0000-4000-8000-0000000000b2';
test('bridge preserves PostgREST zero-versus-multiple semantics for optimistic updates',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql','utf8'));
 await db.exec(`create table public.qa_bridge_rows(id uuid primary key,owner_id uuid not null,version int not null,value text);alter table public.qa_bridge_rows enable row level security;grant select,update on public.qa_bridge_rows to authenticated;create policy owner_rows on public.qa_bridge_rows for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());insert into qa_bridge_rows values('${A}','${A}',2,'unchanged'),('${B}','${A}',2,'unchanged');`);
 const bridge=await startBridge(db,{users:new Map([['synthetic-owner',{id:A}],['synthetic-outsider',{id:B}]])});t.after(()=>bridge.close());
 const client=token=>createClient(bridge.url,'synthetic-public-key',{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const owner=client('synthetic-owner');
 const stale=await owner.from('qa_bridge_rows').update({value:'stale'}).eq('id',A).eq('version',1).select('id').maybeSingle();
 assert.equal(stale.error,null);assert.equal(stale.data,null,'API can return its own conflict rather than a false service outage');
 const strict=await owner.from('qa_bridge_rows').update({value:'stale'}).eq('id',A).eq('version',1).select('id').single();
 assert.equal(strict.error.code,'PGRST116','single still requires exactly one row');
 const many=await owner.from('qa_bridge_rows').update({value:'touched'}).eq('owner_id',A).select('id').maybeSingle();
 assert.equal(many.error.code,'PGRST116');assert.match(many.error.details,/2 rows/,'multiple rows must never be hidden as not found');
 const denied=await client('synthetic-outsider').from('qa_bridge_rows').update({value:'forbidden'}).eq('id',A).select('id').maybeSingle();
 assert.equal(denied.error,null);assert.equal(denied.data,null);
 await db.exec('reset role');assert.ok((await db.query('select value from qa_bridge_rows')).rows.every(r=>r.value==='unchanged'),'singular mismatch rolls back and RLS still blocks outsider writes');
});
