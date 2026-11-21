'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
function scan(sql){const mod={exports:{}};const source=fs.readFileSync('scripts/security/definer-audit.cjs','utf8').replace(/^#![^\n]*\n/,'');new Function('require','module','exports','__dirname',source)(id=>id==='fs'?{readdirSync:()=>['fixture.sql'],readFileSync:()=>sql}:require(id),mod,mod.exports,path.resolve('scripts/security'));return mod.exports.audit();}
test('static effective EXECUTE agrees with PostgreSQL privileges on synthetic fixtures',{timeout:90000},async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec('create role anon;create role authenticated;');
 const fn=name=>`create function public.${name}() returns text language sql security definer set search_path='' as $$select 'synthetic'$$;`;
 const sql=[fn('implicit'),fn('explicit_auth'),'revoke all on function public.explicit_auth() from public;grant execute on function public.explicit_auth() to authenticated;',fn('public_regrant'),'revoke all on function public.public_regrant() from public;grant execute on function public.public_regrant() to public;revoke execute on function public.public_regrant() from anon;',
 'alter default privileges in schema public revoke execute on functions from public;',fn('schema_only'),
 'alter default privileges revoke execute on functions from public;',fn('closed_future'),
 'alter default privileges in schema public grant execute on functions to authenticated;',fn('schema_auth')].join('\n');
 await db.exec(sql);
 const actual=new Map(scan(sql).map(r=>[r.name,r]));
 for(const name of ['implicit','explicit_auth','public_regrant','schema_only','closed_future','schema_auth']){
  const p=(await db.query("select has_function_privilege('anon',$1,'execute') anon,has_function_privilege('authenticated',$1,'execute') authenticated",['public.'+name+'()'])).rows[0];
  const found=actual.get(name);assert.deepEqual({anon:found?.anon||false,authenticated:found?.authenticated||false},p,name);
 }
});
