const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = fs.readFileSync('src/app/admin/creative-bridge/catalog.ts', 'utf8');
const js = ts.transpileModule(src, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const m = {exports:{}};
new Function('module', 'exports', js)(m, m.exports);
const { creativeStatus, filterLibrary } = m.exports;
const sha = 'a'.repeat(64);
const ready = {state:'ready', sha256:sha, public_path:'/creative-bridge/'+sha+'.webp'};
test('only a complete, checksum-shaped local path is displayed as imported; never remote-verified',()=>{
  assert.equal(creativeStatus({ci:'PASSED',assets:[ready]}),'imported');
  assert.equal(creativeStatus({ci:'PASSED',assets:[{...ready,public_path:'https://cdn.invalid/file.webp'}]}),'reference_only');
  assert.equal(creativeStatus({ci:'PASSED',assets:[{...ready,sha256:null}]}),'reference_only');
  assert.equal(creativeStatus({ci:'PASSED',assets:[]}), 'reference_only');
  assert.equal(creativeStatus(null), 'reference_only');
});
test('blocked and pending remain explicit, including corrupt checkpoint',()=>{
  assert.equal(creativeStatus(null,true),'blocked');
  assert.equal(creativeStatus({ci:'FAILED',assets:[ready]}),'blocked');
  assert.equal(creativeStatus({ci:'PASSED',assets:[{state:'failed'}]}),'blocked');
  assert.equal(creativeStatus({ci:'PENDING',assets:[ready]}),'pending');
  assert.equal(creativeStatus({ci:'UNKNOWN',assets:[{state:'generating'}]}),'pending');
});
test('filter by project name, status and lead UUID without cross-client results',()=>{
  const entries = [
    {project:{name:'Alpha launch',settings:{operations:{client_lead_id:'lead-1'}}},status:'imported'},
    {project:{name:'Alpha reference',settings:{operations:{client_lead_id:'lead-2'}}},status:'reference_only'},
    {project:{name:'Beta draft',settings:{operations:{}}},status:'pending'},
  ];
  assert.deepEqual(filterLibrary(entries,{q:'alpha',state:'imported',client:'lead-1'}),[entries[0]]);
  assert.deepEqual(filterLibrary(entries,{client:'lead-2'}),[entries[1]]);
  assert.deepEqual(filterLibrary(entries,{client:'unassigned'}),[entries[2]]);
  assert.deepEqual(filterLibrary(entries,{state:'blocked'}),[]);
  assert.equal(filterLibrary(entries,{q:'A'.repeat(500)}).length,0);
});
