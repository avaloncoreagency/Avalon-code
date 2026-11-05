const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/app/admin/creative-bridge/library-navigation.ts','utf8');
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
new Function('module','exports',js)(mod,mod.exports);
const {CREATIVE_LIBRARY_LINKS:links} = mod.exports;

test('four existing module destinations, no remote or destructive actions',()=>{
 assert.deepEqual(links.map(x=>x.href), [
  '/admin/workspace/website-designer', '/admin/workspace/ecommerce-designer',
  '/admin/workspace/marketing-hub', '/admin/workspace/crm',
 ]);
 assert.equal(new Set(links.map(x=>x.id)).size,4);
 assert.ok(links.every(x=>x.href.startsWith('/admin/workspace/') && !x.href.includes('?') && !x.href.includes('#')));
});
test('both English and Spanish navigation labels are readable',()=>{
 assert.ok(links.every(x=>typeof x.es==='string'&&x.es.trim()&&typeof x.en==='string'&&x.en.trim()));
 assert.ok(links.some(x=>x.es!==x.en));
});
