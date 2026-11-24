const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/crm/inbound-location.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const {readInboxLocation:read,inboxLocationQuery:write}=mod.exports;
test('private inbox navigation roundtrips active filters and zero-based page',()=>{
 const initial={query:'Website & repairs',status:'approved',focus:'pending',page:2};
 assert.deepEqual(read(new URLSearchParams(write(initial))),initial);
 assert.equal(write({query:'',status:'',focus:'',page:0}),'');
});
test('unknown filters, unsafe page numbers and excessive search are bounded before fetching',()=>{
 for(const page of ['-1','NaN','Infinity','2.5','9007199254740992'])assert.equal(read(new URLSearchParams({page})).page,0);
 assert.equal(read(new URLSearchParams({page:'10001'})).page,10000);
 const out=read(new URLSearchParams({status:'__proto__',focus:'paid',q:'x'.repeat(150)}));
 assert.deepEqual([out.status,out.focus,out.query.length],['','',100]);
});
