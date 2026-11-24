const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function action(failure) {
 const loaded={exports:{}};
 const fail=()=>{throw Error('PRIVATE_PROVIDER_DIAGNOSTIC');};
 const mocks={
  'next/navigation':{redirect:url=>{throw Error(url);}},
  'next/headers':{headers:async()=>({get:()=>null})},
  '@/lib/security/rate-limit':{AUTH_RULES:{},authLimiter:{hit:()=>({allowed:true})},clientIp:()=>'',hashKey:()=>''},
  '@/lib/auth/policy':{},
  '@/lib/auth/email-flow':{validPasswordFlow:async()=>failure!=='invalid-proof',clearPasswordFlow:async()=>{if(failure==='clear')fail();}},
  '@/lib/supabase/server':{createClient:async()=>{
   if(failure==='create')fail();
   return {auth:{getUser:async()=>{if(failure==='identity')fail();return {data:{user:{id:'synthetic'}},error:null};},updateUser:async()=>{if(failure==='update')fail();return {error:null};},signOut:async()=>{if(failure==='logout')fail();return {error:null};}}};
  }},
 };
 const code=ts.transpileModule(fs.readFileSync(process.env.PASSWORD_ACTION_SOURCE || 'src/app/admin/password-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',code)(id=>mocks[id],loaded,loaded.exports);
 return loaded.exports.savePassword;
}
for(const flow of ['invite','recovery'])for(const failure of ['create','identity','invalid-proof','update','clear','logout','none']){
 test(`${flow}: password setup handles ${failure} without leaking provider errors`,async()=>{
  const form=new FormData();form.set('flow',flow);form.set('password','synthetic-password-123');form.set('confirm','synthetic-password-123');
  const path=flow==='invite'?'/admin/signup':'/admin/reset-password';
  const expected=['create','identity','invalid-proof'].includes(failure)?path+'?error=expired':failure==='update'?path+'?error=password':['clear','logout'].includes(failure)?'/admin/login?error=unavailable':'/admin/login?updated=1';
  await assert.rejects(action(failure)(form),error=>error.message===expected);
 });
}
