const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path'),ts=require('typescript');
const load=require('../scripts/creative-bridge/continuity-loader.cjs'),domain=load('src/lib/os/client-hud.ts');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function route({owner=true,secret=false}={}){
 const settings=domain.applyProductAction({operations:{url:'https://example.com/?token=synthetic',repository:'https://example.com/source#private'}},'website','request',{title:'Synthetic bug',details:secret?'sk_live_'+'X'.repeat(24):'Synthetic reproduction',priority:'normal'},A,'2026-11-14T14:00:00.000Z',B);
 const project={id:A,module:'website',name:'Synthetic',description:'Synthetic only',client_id:B,version:7,settings:settings};
 const calls=[];const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:project,error:null})};
 const mocks={'next/server':{NextResponse:Response},'@/lib/auth/session':{getOwnerSession:async()=>owner?{supabase:{from(t){calls.push(t);return q}}}:null},'@/lib/os/client-hud':domain,'@/lib/project-bridge/policy':load('src/lib/project-bridge/policy.ts')};
 const f=path.resolve('src/app/admin/workspace/products/[id]/brief/route.ts'),m=new Module(f,module);m.filename=f;m.paths=module.paths;m.require=id=>Object.hasOwn(mocks,id)?mocks[id]:require(id);m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
 return {get:()=>m.exports.GET({nextUrl:new URL('https://example.com/?request='+B)},{params:Promise.resolve({id:A})}),calls};
}
test('AI report requires owner authorization before reading data',async()=>{const h=route({owner:false});assert.equal((await h.get()).status,401);assert.equal(h.calls.length,0)});
test('AI report has canonical context and excludes URL query and fragment credentials',async()=>{const r=await route().get();assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);const text=await r.text();assert.ok(text.includes(B));assert.ok(text.includes('"record_version": 7'));assert.ok(!text.includes('token=synthetic'));assert.ok(!text.includes('#private'));});
test('known credential patterns block report download instead of returning them',async()=>{const r=await route({secret:true}).get();assert.equal(r.status,409);assert.ok(!(await r.text()).includes('sk_live_'));});
