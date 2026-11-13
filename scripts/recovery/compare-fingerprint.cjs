#!/usr/bin/env node
// Compare two fingerprints produced by schema-fingerprint.sql: expected (repo chain) vs actual (a real database).
// Usage: node scripts/recovery/compare-fingerprint.cjs expected.json actual.json  → prints missing / extra / changed objects.
const fs = require('node:fs');
const [expectedFile, actualFile] = process.argv.slice(2);
if (!expectedFile || !actualFile) { console.error('usage: compare-fingerprint.cjs expected.json actual.json'); process.exit(2); }
const load = f => { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j.fingerprint ?? j; };
const exp = load(expectedFile), act = load(actualFile);
const key = s => s.replace(/ #[0-9a-f]{10}$/, '').replace(/ \[(no-)?rls\]$/, '');
let differences = 0;
for (const section of Object.keys(exp)) {
  const e = new Map(exp[section].map(x => [key(x), x])), a = new Map((act[section] ?? []).map(x => [key(x), x]));
  const missing = [...e.keys()].filter(k => !a.has(k)), extra = [...a.keys()].filter(k => !e.has(k));
  const changed = [...e.keys()].filter(k => a.has(k) && a.get(k) !== e.get(k)).map(k => `${e.get(k)}  ≠  ${a.get(k)}`);
  if (missing.length + extra.length + changed.length === 0) { console.log(`✔ ${section}: ${e.size} equal`); continue; }
  differences += missing.length + extra.length + changed.length;
  console.log(`✖ ${section}: missing ${missing.length}, extra ${extra.length}, changed ${changed.length}`);
  for (const m of missing) console.log('   - missing  ' + e.get(m));
  for (const x of extra) console.log('   + extra    ' + a.get(x));
  for (const c of changed) console.log('   ~ changed  ' + c);
}
process.exit(differences ? 1 : 0);
