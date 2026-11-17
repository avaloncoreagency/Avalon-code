const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const Module=require('node:module');const path=require('node:path');const ts=require('typescript');
const file=path.resolve('src/components/crm/calendar-time.ts');
function load(){const m=new Module(file,module);m.filename=file;m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
test('Florida calendar civil times do not depend on browser or host timezone',()=>{const {calendarInstant,calendarInput}=load();assert.equal(calendarInstant('2026-11-16T09:30').iso,'2026-11-16T14:30:00.000Z');assert.equal(calendarInstant('2026-07-16T09:30').iso,'2026-07-16T13:30:00.000Z');assert.equal(calendarInput('2026-11-16T14:30:00Z'),'2026-11-16T09:30');});
test('DST gaps and repeated hours are explicit errors instead of silently shifted appointments',()=>{const {calendarInstant}=load();assert.equal(calendarInstant('2027-03-14T02:30').error,'nonexistent');assert.equal(calendarInstant('2026-11-01T01:30').error,'ambiguous');assert.equal(calendarInstant('2026-11-01T02:30').iso,'2026-11-01T07:30:00.000Z');});
test('invalid dates are rejected before submitting server actions',()=>{const {calendarInstant,calendarInput}=load();for(const x of ['2026-02-30T12:00','2026-11-16T25:00','garbage','2026-11-16'])assert.equal(calendarInstant(x).error,'invalid');assert.equal(calendarInput('garbage'),'');});

test('editing another field preserves the stored occurrence of a repeated DST hour',()=>{const {calendarInstant}=load();for(const previous of ['2026-11-01T05:30:15.000Z','2026-11-01T06:30:45.000Z'])assert.equal(calendarInstant('2026-11-01T01:30','America/New_York',previous).iso,previous);});


// Display labels must not depend on runtime-specific ICU date wording.
test('calendar labels are deterministic even if Intl formatting differs',()=>{
 const fs=require('node:fs'),ts=require('typescript');const m={exports:{}};
 const dep={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/crm/shared-calendar.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(dep,dep.exports);
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync('src/components/crm/calendar-labels.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports,()=>dep.exports);
 const original=Intl.DateTimeFormat;Intl.DateTimeFormat=function(){throw Error('No runtime formatting for hydration labels');};
 try{assert.equal(m.exports.calendarMonthLabel('2026-11-22','es'),'noviembre 2026');assert.equal(m.exports.calendarDayLabel('2026-11-22','en'),'Sun 22 November');}finally{Intl.DateTimeFormat=original;}
});
