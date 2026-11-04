const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));const m={exports:{}};cache.set(file,m.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id.endsWith('.json')?id:id+'.ts')):require(id),m,m.exports);return m.exports;}
module.exports=load;
