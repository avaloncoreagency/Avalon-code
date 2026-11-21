'use strict';
// Actual owner authorization with synthetic Auth/membership transport only.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>{if(id==='server-only')return{};if(Object.hasOwn(mocks,id))return mocks[id];throw Error('Unreviewed dependency '+id);},mod,mod.exports);return mod.exports;}
function fixture(options={}){
 const ids=[];const user={id:'00000000-0000-4000-8000-0000000000c3',email:'outsider@example.invalid',app_metadata:{provider:'email'},user_metadata:{role:'owner',user_id:'00000000-0000-4000-8000-0000000000a1'}};
 const client={auth:{getUser:async()=>options.expired?{data:{user:null},error:{message:'expired'}}:{data:{user},error:null},getSession:()=>{throw Error('Do not authorize from cached session');},mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:options.mfa?'aal2':'aal1'},error:options.mfaError?{}:null})}},from:()=>({select(){return this;},eq(key,id){ids.push([key,id]);return this;},maybeSingle:async()=>({data:options.missing?null:{role:options.role||'operator'},error:options.membershipError?{}:null})})};
 const policy=load('src/lib/auth/policy.ts');const access=load('src/lib/auth/access.ts',{'./policy':policy,'@/lib/supabase/server':{createClient:()=>{throw Error('explicit client required');}}});
 return{access,client,ids,user};
}
test('expired verified identity is denied before membership lookup',async()=>{const f=fixture({expired:true,role:'owner'});assert.equal(await f.access.getAuthorizedOwner(f.client),null);assert.deepEqual(f.ids,[]);});
test('editable owner metadata never promotes an operator',async()=>{const f=fixture();assert.equal(await f.access.getAuthorizedOwner(f.client),null);assert.deepEqual(f.ids,[['user_id',f.user.id]]);});
test('missing membership and lookup outage deny an otherwise valid user',async()=>{for(const o of[{missing:true},{membershipError:true,role:'owner'}]){const f=fixture(o);assert.equal(await f.access.getAuthorizedOwner(f.client),null);}});
test('owner needing MFA cannot use owner-only operations at aal1',async()=>{const f=fixture({role:'owner',mfa:true});assert.equal(await f.access.getAuthorizedOwner(f.client),null);});
test('assurance lookup failure fails closed',async()=>{const f=fixture({role:'owner',mfaError:true});assert.equal(await f.access.getAuthorizedOwner(f.client),null);});
test('verified owner uses the trusted subject, not metadata substitute',async()=>{const f=fixture({role:'owner'});const r=await f.access.getAuthorizedOwner(f.client);assert.equal(r.userId,f.user.id);assert.notEqual(r.userId,f.user.user_metadata.user_id);});
