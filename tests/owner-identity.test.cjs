const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const load=require('../scripts/creative-bridge/continuity-loader.cjs');
const names=load('src/lib/identity/owners.ts');
const model=load('src/lib/quotes/model.ts');
const {renderQuotePdf}=load('src/lib/quotes/pdf.ts');
test('official aliases and accents resolve without changing internal identifiers',()=>{
 for(const x of ['avalonagencymh','AVALONAGENCYMH@gmail.com','Miguel','Miguel Hobaica'])assert.equal(names.officialOwnerName(x),'Miguel Hobaica');
 for(const x of ['avaloncoreagencysm','avaloncoreagencysm@gmail.com','Samuel','Samuel Munoz','Samuel Muñoz'])assert.equal(names.officialOwnerName(x),'Samuel Muñoz');
 for(const x of ['__proto__','constructor','someone@avalonagencymh.example','avalonagencymh+alias@gmail.com'])assert.equal(names.officialOwnerName(x),null);
});
test('all users use profile names; owner official email overrides stale editable nickname',()=>{
 assert.equal(names.personDisplayName({email:'avalonagencymh@gmail.com',display_name:'Old handle'}),'Miguel Hobaica');
 assert.equal(names.personDisplayName({user_id:'uuid-employee',email:'technical@example.invalid',display_name:'Ana María Pérez'}),'Ana María Pérez');
 assert.equal(names.personDisplayName({email:'technical@example.invalid'},'Name pending'),'Name pending');
 assert.equal(names.personDisplayName({email:'another@example.invalid',display_name:'Miguel Pérez'}),'Miguel Pérez');
 const directory=[{user_id:'immutable-id',email:'avaloncoreagencysm@gmail.com',display_name:'samuel'}];
 const before=JSON.stringify(directory);assert.equal(names.directoryDisplayName(directory,'immutable-id'),'Samuel Muñoz');assert.equal(JSON.stringify(directory),before);
 assert.equal(names.directoryDisplayName(directory,'00000000-0000-4000-8000-000000000001','Unavailable'),'Unavailable');
});
test('historical quote digest and snapshot remain intact while regenerated PDF uses official author in ES/EN',()=>{
 const fixture={schemaVersion:1,lang:'es',currency:'USD',title:'Synthetic quote',issueDate:'2026-11-23',validUntil:'2099-12-31',client:{company:'QA Company',contact:'External Person',email:'qa@example.invalid',phone:'',address:''},issuer:{name:'Avalon Core Agency',email:'qa@example.invalid',phone:''},seller:'avaloncoreagencysm',objectives:'',problem:'',solution:'',scope:'',deliverables:'',exclusions:'',dependencies:'',timeline:'',support:'',terms:'',notes:'',thirdPartyCosts:'',model:'fixed',lines:[{code:'desarrollo-web',name:'Website',description:'',kind:'one_time',qty:1,unitPrice:'100'}],commission:null};
 for(const lang of ['es','en']){
  const c={...fixture,lang};const before=JSON.stringify(c);const digest=()=>crypto.createHash('sha256').update(model.canonicalQuote(c)).digest('hex');const original=digest();
  const pdf=Buffer.from(renderQuotePdf(c,{number:'Q-2026-0001',version:1})).toString('latin1');
  assert.match(pdf,/Samuel Muñoz/);assert.doesNotMatch(pdf,/avaloncoreagencysm/);assert.equal(JSON.stringify(c),before);assert.equal(digest(),original);
 }
});
test('display resolver stays outside authorization policies and preserves source identities',()=>{
 for(const f of ['src/lib/auth/access.ts','src/lib/auth/policy.ts','src/lib/supabase/middleware.ts'])assert.doesNotMatch(fs.readFileSync(f,'utf8'),/identity\/owners|officialOwnerName|personDisplayName/);
 const session=fs.readFileSync('src/lib/auth/session.ts','utf8');assert.match(session,/getAuthorizedOwner\(supabase\)/);
});
test('directory loads existing profiles and preserves scope/error instead of exposing extra users',async()=>{
 const ts=require('typescript');const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/lib/identity/directory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(id=>{assert.equal(id,'server-only');return{}},mod,mod.exports);
 let calls=[];const db={rpc:async name=>{calls.push(name);return {data:[{user_id:'owner-id',role:'owner',email:'someone@example.invalid',display_name:'Carla López'},{user_id:'staff-id',role:'operator',display_name:'Other Person'}],error:null}}};
 const result=await mod.exports.loadOwnerDirectory(db);assert.deepEqual(result.data.map(p=>p.user_id),['owner-id']);assert.equal(names.personDisplayName(result.data[0]),'Carla López');assert.deepEqual(calls,['office_directory']);
 calls=[];const denied=await mod.exports.loadOwnerDirectory({rpc:async name=>{calls.push(name);return {data:null,error:{code:'42501'}}}});assert.equal(denied.data,null);assert.equal(denied.error.code,'42501');assert.deepEqual(calls,['office_directory'],'permission failures must not fall back around scope');
});
