const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
function load(file,overrides={},source) {const m={exports:{}};const code=ts.transpileModule(source??fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','module','exports',code)(name=>{if(name==='server-only')return {};if(name in overrides)return overrides[name];if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,p)=>String(p)})};if(name.startsWith('@/'))return load(path.join('src',name.slice(2))+'.ts',overrides);if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts',overrides);return require(name);},m,m.exports);return m.exports;}
const {journeyAction}=load('src/lib/crm/commercial-journey.ts');const {activeFollowup,agendaIncomplete}=load('src/lib/crm/operational-agenda.ts');
test('journey recommendations preserve separate evidence, multiple accepted quotes, losses and partial failure',()=>{
 const base={stage:'new',diagnosis:'pending',unavailable:false,sales:0,quotes:0,accepted:0,verifiedContract:false};
 for(const [fields,expected] of [[{},'contact'],[{stage:'nurture'},'followup'],[{diagnosis:'complete'},'create_quote'],[{quotes:3},'quotes'],[{accepted:1},'contract'],[{accepted:1,verifiedContract:true},'close'],[{accepted:2,verifiedContract:true},'quotes'],[{sales:1},'sale'],[{stage:'won',verifiedContract:true},'diagnosis'],[{stage:'lost',sales:1},'history'],[{unavailable:true,accepted:1,sales:1},'review']])assert.equal(journeyAction({...base,...fields}),expected);
});
test('closed standard and custom opportunities stop commercial follow-ups; provider failures are partial, not empty',()=>{
 for(const stage of ['won','lost','custom-closed'])assert.equal(activeFollowup(stage,['custom-closed']),false);
 assert.equal(activeFollowup('nurture',['custom-closed']),true);assert.equal(agendaIncomplete(null,null,'unavailable',null),true);assert.equal(agendaIncomplete(null,null,null,'denied'),true);assert.equal(agendaIncomplete(null,null,null,null),false);
});
const lead={id:'11111111-1111-4111-8111-111111111111',stage_id:'proposal',diagnosis_status:'complete',next_action:'Revisar términos sintéticos',follow_up_at:null,last_interaction_at:null};
async function renderJourney(lang='es',failed=false){
 const calls=[];const quote={id:'22222222-2222-4222-8222-222222222222',quote_number:'QA-ONLY',status:'accepted',current_version:3};
 const db={from(table){const query={table,filters:[]};const chain=new Proxy({},{get:(_,method)=>method==='then'?(resolve)=>{calls.push(query);resolve({data:table==='crm_quotes'?[quote]:table==='crm_clients'?null:[],error:failed&&table==='crm_sales'?{code:'42501'}:null,count:table==='crm_quotes'?(query.filters.some(x=>x[0]==='eq'&&x[1]==='status'&&x[2]==='accepted')?1:201):0});}:(...args)=>{query.filters.push([method,...args]);return chain;}});return chain;}};
 const {CommercialJourney}=load('src/components/crm/commercial-journey.tsx',{'next/link':{default:({href,children,...props})=>React.createElement('a',{href,...props},children)}});
 return {html:renderToStaticMarkup(await CommercialJourney({supabase:db,lead,lang,verifiedContract:true,contractError:false})),calls};
}
test('real component uses exact canonical relations and server counts above the visible page; unavailable sales never offer new sale',async()=>{
 const {html,calls}=await renderJourney();assert.match(html,/201/);assert.match(html,/QA-ONLY/);assert.match(html,/v3/);assert.match(html,/22222222-2222-4222-8222-222222222222#close-sale/);assert.match(html,/quotes\?lead=11111111/);
 for(const c of calls.filter(x=>x.table==='crm_quotes')){assert.ok(c.filters.some(x=>x[0]==='eq'&&x[1]==='lead_id'&&x[2]===lead.id));assert.ok(c.filters.some(x=>x[0]==='is'&&x[1]==='deleted_at'&&x[2]===null));}
 assert.match((await renderJourney('en',true)).html,/Partially available/);
});
if(process.env.NEXUS_BROWSER==='1')test('isolated rendered journey ES/EN across six widths (Chromium, not physical Safari)',async()=>{
 const {chromium}=require('playwright');const browser=await chromium.launch({headless:true});try{for(const lang of ['es','en'])for(const width of [320,375,390,430,768,1440]){const page=await browser.newPage({viewport:{width,height:900}});const {html}=await renderJourney(lang);await page.setContent('<html><head><style>body{font-family:system-ui,sans-serif;margin:12px;background:#101522;color:white}'+fs.readFileSync('src/components/crm/commercial-journey.module.css','utf8')+'</style></head><body>'+html+'</body></html>');assert.equal(await page.getByRole('heading',{name:lang==='es'?'Camino comercial':'Commercial journey'}).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('summary').click();assert.ok(await page.getByRole('link',{name:'QA-ONLY'}).isVisible());const dir=process.env.NEXUS_EVIDENCE_DIR;if(dir){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,`journey-${lang}-${width}.png`),fullPage:true});}await page.close();}}finally{await browser.close();}
});

async function calendarHtml(source,failed=false,denied=false,agendaPage=0,total,followUpAt='2026-11-25T12:00:00Z'){
 const db={from(table){let fields='';const filters=[];const chain=new Proxy({},{get:(_,method)=>method==='then'?(resolve)=>{let rows=table==='crm_stages'?[{id:'custom-closed'}]:table==='crm_leads'&&fields.includes('follow_up_at')?['new','lost','won','custom-closed'].map(stage=>({id:stage,company:'SYNTH-'+stage,stage_id:stage,follow_up_at:followUpAt,owner_id:lead.id})):[];for(const [op,key,value] of filters){if(op==='neq')rows=rows.filter(r=>r[key]!==value);if(op==='not'&&key==='stage_id')rows=rows.filter(r=>!['won','lost'].includes(r.stage_id));}resolve({data:failed&&table==='crm_leads'?null:rows,error:failed&&table==='crm_leads'?{code:'42501'}:null,count:table==='crm_leads'&&fields.includes('follow_up_at')?(total??rows.length):rows.length});}:(...args)=>{if(method==='select')fields=args[0];if(method==='range')assert.deepEqual(args,[agendaPage*50,agendaPage*50+49]);filters.push([method,...args]);return chain;}});return chain;}};
 const Wrapper=({children})=>React.createElement('div',{},children);
 const page=load('src/app/admin/workspace/crm/calendar/page.tsx',{'next/link':{default:({href,children})=>React.createElement('a',{href},children)},'@/components/suite/suite':{Suite:Wrapper},'@/components/crm/shared-calendar':{SharedCalendar:()=>null},'@/components/crm/navigation':{CrmNavigation:()=>null},'@/lib/auth/session':{requireOwner:async()=>{if(denied)throw Error('AUTH_DENIED');return {supabase:db,userId:lead.id};}},'@/lib/i18n-server':{getLang:async()=> 'en'},'@/lib/identity/directory':{loadOwnerDirectory:async()=>({data:[],error:null})},'@/components/sales/ui':{OpsLinks:()=>null,Tag:Wrapper,ownerName:()=> 'Synthetic owner',UUID_RE:/^[0-9a-f-]{36}$/,q:(p,k)=>p[k]??null}},source);
 return renderToStaticMarkup(await page.default({searchParams:Promise.resolve({agenda_page:String(agendaPage),date:'2026-11-24',view:'week'})}));
}
test('actual calendar excludes standard/custom closed stages and exposes partial provider errors; optional pinned baseline control',async()=>{
 if(process.env.NEXUS_BASELINE_SOURCE){const baseline=fs.readFileSync(process.env.NEXUS_BASELINE_SOURCE,'utf8');assert.match(await calendarHtml(baseline),/SYNTH-lost/);assert.doesNotMatch(await calendarHtml(baseline,true),/agenda is partially available/);}
 const html=await calendarHtml();assert.match(html,/SYNTH-new/);for(const stage of ['lost','won','custom-closed'])assert.ok(!html.includes('SYNTH-'+stage));assert.match(await calendarHtml(undefined,true),/agenda is partially available/);
 await assert.rejects(()=>calendarHtml(undefined,false,true),/AUTH_DENIED/);
});

test('Sales Center gives the canonical database query the search term before fetching a candidate page',()=>{
 const source=fs.readFileSync('src/app/admin/workspace/crm/sales/new/page.tsx','utf8');
 assert.match(source,/quoteCandidateQuery\(supabase, statuses, search, page\)/);
 assert.match(source,/const toClose = candidates\.data \?\? \[\]/);
 assert.match(source,/const candidateCount = candidates\.count/);
 assert.doesNotMatch(source,/\.limit\((200|1000)\)|closedQuoteIds/);
});

test('calendar 49/50/51 and later pages preserve date/view and stable server ranges',async()=>{
 for(const total of [49,50,51])assert.equal((await calendarHtml(undefined,false,false,0,total)).includes('>Next</a>'),total>50);
 const last=await calendarHtml(undefined,false,false,4,201);assert.ok(!last.includes('>Next</a>'));assert.match(last,/agenda_page=3/);assert.match(last,/date=2026-11-24/);assert.match(last,/view=week/);
});

test('calendar groups a UTC-next-day follow-up under its actual Eastern day and does not report empty on failed reads',async()=>{
 const html=await calendarHtml(undefined,false,false,0,1,'2026-11-25T01:30:00Z');
 assert.match(html,/aria-label="Nov 24, 2026"/);
 assert.doesNotMatch(html,/aria-label="Nov 25, 2026"/);
 assert.match(html,/SYNTH-new/);
 const unavailable=await calendarHtml(undefined,true);
 assert.match(unavailable,/Dates in this period could not be verified/);
 assert.doesNotMatch(unavailable,/No dates in this period/);
});

async function dashboardHtml(failed=false){
 const calls=[];let stats;
 const supabase={
  rpc(name){return Promise.resolve({data:name==='crm_sales_metrics'?[]:{draft:0,sent:0,overdue:0,accepted_without_contract:0},error:null});},
  from(table){
   const q={table,filters:[],count:false,limit:null};
   const chain=new Proxy({},{get:(_,method)=>method==='then'?resolve=>{
    calls.push(q);
    const eq=key=>q.filters.find(f=>f[0]==='eq'&&f[1]===key)?.[2];
    let count=0, data=[];
    if(table==='os_projects'&&q.count){
     count=({website:701,ecommerce:40,crm_creator:20,marketing:50,chatbots:10,receptionist:5})[eq('module')]??(eq('status')==='active'?901:1201);
    }else if(table==='os_projects'){data=[{id:'synthetic-project',module:'website',name:'Recent synthetic project',status:'active'}];}
    if(table==='os_marketing_items'&&q.count)count=q.filters.some(f=>f[0]==='lt'&&f[1]==='planned_for')?22:34;
    if(failed&&(table==='os_marketing_items'||table==='os_audit'||(table==='os_projects'&&eq('module')==='website'))){resolve({data:null,error:{code:'42501'},count:null});return;}
    resolve({data,error:null,count:q.count?count:null});
   }:(...args)=>{
    if(method==='select')q.count=args[1]?.count==='exact';
    if(method==='limit')q.limit=args[0];
    q.filters.push([method,...args]);return chain;
   }});
   return chain;
  }
 };
 const Wrapper=({children})=>React.createElement('div',{},children);
 const page=load('src/app/admin/dashboard/page.tsx',{
  'next/link':{default:({href,children,...props})=>React.createElement('a',{href,...props},children)},
  '@/components/suite/suite':{Suite:Wrapper},
  '@/components/suite/module-cards':{ModuleCards:props=>{stats=props.stats;return null;}},
  '@/components/suite/icons':{Icon:()=>null},
  '@/lib/auth/session':{requireOwner:async()=>({supabase,user:{},userId:lead.id}),displayName:()=> 'Synthetic owner'},
  '@/lib/i18n-server':{getLang:async()=> 'en'},
  '@/lib/os/integrations':{INTEGRATIONS:[]},
  '@/lib/sales/domain':{money:(_lang,value)=>String(value)}
 });
 const html=renderToStaticMarkup(await page.default());
 return {html,stats,calls};
}
test('dashboard counts all owner-visible projects and marketing records, separately from bounded previews',async()=>{
 const {html,stats,calls}=await dashboardHtml();
 assert.match(html,/<strong>901<\/strong>/);
 assert.match(html,/1201 total \(not archived\)/);
 assert.match(html,/<strong>34<\/strong>/);
 assert.match(html,/22 overdue/);
 assert.equal(stats.website.value,701);
 assert.equal(stats.communications.value,15);
 assert.equal(calls.find(q=>q.table==='os_projects'&&!q.count).limit,6);
 assert.equal(calls.find(q=>q.table==='os_marketing_items'&&!q.count).limit,8);
 const bad=await dashboardHtml(true);
 assert.equal(bad.stats.website.value,null);
 assert.equal(bad.stats.website.state,'pending');
 assert.match(bad.html,/Pending content could not be read/);
 assert.match(bad.html,/Recent activity could not be read/);
 assert.doesNotMatch(bad.html,/No activity recorded yet/);
});
