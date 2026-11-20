const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const mod={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync('src/lib/os/data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports,()=>({}));
function db(rows){const calls=[],filters=[];let from=0,to=99;const q={select(...x){calls.push(['select',...x]);return this},eq(k,v){filters.push(r=>r[k]===v);calls.push(['eq',k,v]);return this},neq(k,v){filters.push(r=>r[k]!==v);calls.push(['neq',k,v]);return this},ilike(k,v){calls.push(['ilike',k,v]);const literal=v.slice(1,-1).replace(/\\(.)/g,'$1').toLowerCase();filters.push(r=>r[k].toLowerCase().includes(literal));return this},order(){return this},range(a,b){calls.push(['range',a,b]);from=a;to=b;return this},limit(n){calls.push(['limit',n]);to=n-1;return this},then(resolve,reject){const selected=rows.filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:selected.slice(from,to+1),count:selected.length,error:null}).then(resolve,reject)}};return {calls,from(){return q}}}
test('global product search finds a match beyond the first loaded page and returns the filtered exact count',async()=>{
 const rows=Array.from({length:101},(_,i)=>({id:String(i),module:'website',name:i===100?'Needle Project':'Project '+i,status:'draft'}));
 assert.equal((await mod.exports.listProjects(db(rows),'website',{page:1})).data.some(p=>p.name==='Needle Project'),false);
 const q=db(rows),out=await mod.exports.listProjects(q,'website',{page:1,search:' Needle '});
 assert.equal(out.count,1);assert.equal(out.data[0].name,'Needle Project');
 assert.ok(q.calls.findIndex(c=>c[0]==='ilike')<q.calls.findIndex(c=>c[0]==='range'),'filter precedes pagination');
});
test('global status filter includes archived only when explicitly requested and retains canonical client scope',async()=>{
 const q=db([{module:'website',client_id:'client-a',status:'archived',name:'Old'},{module:'website',client_id:'client-b',status:'archived',name:'Other'}]);
 const out=await mod.exports.listProjects(q,'website',{page:1,status:'archived',clientId:'client-a'});assert.equal(out.count,1);assert.equal(out.data[0].name,'Old');
 assert.ok(!q.calls.some(c=>c[0]==='neq'&&c[1]==='status'));
});
test('literal percent/underscore/backslash remain escaped and search is bounded without changing legacy limits',async()=>{
 const q=db([]);await mod.exports.listProjects(q,'website',{search:'  100%_\\name  '});
 assert.deepEqual(q.calls.find(c=>c[0]==='ilike'),['ilike','name','%100\\%\\_\\\\name%']);assert.ok(q.calls.some(c=>c[0]==='limit'&&c[1]===100));
 const long=db([]);await mod.exports.listProjects(long,'website',{page:2,search:'x'.repeat(1000)});assert.equal(long.calls.find(c=>c[0]==='ilike')[2].length,82);assert.deepEqual(long.calls.find(c=>c[0]==='range'),['range',50,99]);
});
test('search is server-submitted and all four product routes retain it through paginated views',()=>{
 for(const route of ['website-designer','ecommerce-designer','crm-creator','marketing-hub']){
  const s=fs.readFileSync('src/app/admin/workspace/'+route+'/page.tsx','utf8');assert.match(s,/search: searchQuery, status: stateFilter/);assert.match(s,/searchQuery=\{searchQuery\} stateFilter=\{stateFilter\}/);
 }
 const ui=fs.readFileSync('src/components/os/projects.tsx','utf8');assert.match(ui,/<form method="get"/);assert.ok(ui.includes("params.set('q',searchQuery)"));assert.ok(ui.includes("params.set('status',stateFilter)"));
});
