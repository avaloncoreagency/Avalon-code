'use strict';
// Isolated SQL text fixtures: no filesystem mutation, DB or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function audit(files){
 const mod={exports:{}};
 const source=fs.readFileSync('scripts/security/definer-audit.cjs','utf8').replace(/^#![^\n]*\n/,'');
 const fakeFs={readdirSync:()=>Object.keys(files),readFileSync:p=>files[path.basename(p)]};
 new Function('require','module','exports','__dirname',source)(id=>id==='fs'?fakeFs:require(id),mod,mod.exports,path.resolve('scripts/security'));
 return mod.exports.audit();
}
const fn="create function public.synthetic_unsafe() returns text language sql security definer set search_path='' as $$ select 'synthetic' $$;";
test('implicit PUBLIC EXECUTE makes a fresh privileged function visible to both roles',()=>{
 const rows=audit({'001.sql':fn});
 assert.equal(rows.length,1,'must not hide a fresh function with implicit PUBLIC EXECUTE');
 assert.equal(rows[0].anon,true);assert.equal(rows[0].authenticated,true);assert.equal(rows[0].gate,'ungated');
});
test('revoke PUBLIC closes implicit access but preserves explicit authenticated grant',()=>{
 const rows=audit({'001.sql':fn+' grant execute on function public.synthetic_unsafe() to authenticated; revoke all on function public.synthetic_unsafe() from public;'});
 assert.equal(rows.length,1);assert.equal(rows[0].anon,false);assert.equal(rows[0].authenticated,true);
});
test('grant PUBLIC cannot be undone by revoking only a direct anon grant',()=>{
 const rows=audit({'001.sql':fn+' revoke all on function public.synthetic_unsafe() from public; grant execute on function public.synthetic_unsafe() to public; revoke execute on function public.synthetic_unsafe() from anon;'});
 assert.equal(rows.length,1);assert.equal(rows[0].anon,true);assert.equal(rows[0].authenticated,true);
});
test('default-ACL revocation applies only to future functions, without changing existing grants',()=>{
 const rows=audit({'001.sql':fn,'002.sql':"alter default privileges for role postgres revoke execute on functions from public;",'003.sql':fn.replace('synthetic_unsafe','synthetic_later')});
 assert.deepEqual(rows.map(r=>r.name),['synthetic_unsafe']);
});
test('explicit PUBLIC revoke removes both inherited roles',()=>{
 assert.deepEqual(audit({'001.sql':fn+' revoke all on function public.synthetic_unsafe() from public;'}),[]);
});
test('schema-only default revoke does not remove the global built-in PUBLIC default',()=>{
 const rows=audit({'001.sql':"alter default privileges in schema public revoke execute on functions from public;"+fn});
 assert.equal(rows.length,1);assert.equal(rows[0].anon,true);
});
test('CREATE OR REPLACE preserves a closed ACL instead of re-opening it',()=>{
 const rows=audit({'001.sql':fn+' revoke all on function public.synthetic_unsafe() from public;','002.sql':fn.replace('create function','create or replace function')});
 assert.deepEqual(rows,[]);
});
test('DDL order inside one file preserves existing rights and closes only future definitions',()=>{
 const rows=audit({'001.sql':fn+" alter default privileges revoke execute on functions from public;"+fn.replace('synthetic_unsafe','synthetic_later')});
 assert.deepEqual(rows.map(r=>r.name),['synthetic_unsafe']);
});
