const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const path=require('node:path');
function load(file){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.join(path.dirname(file),id+'.ts')):require(id),m,m.exports);return m.exports;}
const {operations}=load('src/lib/os/project-operations.ts');
test('operational project metadata validates HTTPS, bounds and CRM identity reference',()=>{
 assert.equal(operations({tasks:'Review deployment',url:'https://example.invalid'}).tasks,'Review deployment');
 for(const input of [{url:'javascript:alert(1)'},{repository:'https://user:password@example.invalid'},{client_lead_id:'email@example.invalid'},{tasks:'x'.repeat(2001)}])assert.throws(()=>operations(input));
});
