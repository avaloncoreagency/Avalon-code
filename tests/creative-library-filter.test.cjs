const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const src = fs.readFileSync('src/app/admin/creative-bridge/catalog.ts', 'utf8');
const compile = (text) => ts.transpileModule(text, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const media = {exports:{}};
new Function('module', 'exports', 'require', compile(fs.readFileSync('src/app/admin/creative-bridge/media-safety.ts','utf8')))(
  media, media.exports, () => { throw Error('Unexpected media-safety runtime dependency'); });
const m = {exports:{}};
new Function('module', 'exports', 'require', compile(src))(m, m.exports, id => {
  if (id === './media-safety') return media.exports;
  throw Error('Unexpected catalog runtime dependency: ' + id);
});
const { creativeStatus, creativeStatusLabel, filterLibrary } = m.exports;
const sha = 'a'.repeat(64);
const ready = {kind:'image', state:'ready', sha256:sha, public_path:'/creative-bridge/'+sha+'.webp'};
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

test('creative catalog labels keep verified and unknown claims distinct in EN/ES', () => {
  assert.equal(creativeStatusLabel('imported','es'), 'Ruta local registrada (sin verificar)');
  assert.equal(creativeStatusLabel('imported','en'), 'Registered local path (unverified)');
  assert.equal(creativeStatusLabel('pending','es'), 'Pendiente');
  assert.equal(creativeStatusLabel('pending','en'), 'Pending');
  assert.equal(creativeStatusLabel('blocked','es'), 'Bloqueado');
  assert.equal(creativeStatusLabel('blocked','en'), 'Blocked');
  assert.equal(creativeStatusLabel('reference_only','es'), 'Solo referencia');
  assert.equal(creativeStatusLabel('reference_only','en'), 'Reference only');
});

test('creative page fails closed for unvalidated checkpoint attribution (static integration guard)', () => {
  const page = fs.readFileSync('src/app/admin/creative-bridge/page.tsx', 'utf8');
  assert.ok(page.includes('checkpoint?.agent'));
  assert.ok(page.includes('checkpoint?.head_sha'));
  assert.equal(page.includes('p.settings?.creative_continuity?.agent'), false);
  assert.equal(page.includes('p.settings?.creative_continuity?.head_sha'), false);
  assert.ok(page.includes('Agent claimed by checkpoint'));
  assert.ok(page.includes('Claimed SHA (not checked against GitHub)'));
  assert.ok(page.includes('No valid checkpoint'));
});

test('catalog never labels a media-path mismatch or unsupported GLB as imported', () => {
  const invalid = [
    {...ready, public_path:'/creative-bridge/'+sha+'.glb'},
    {...ready, kind:'video', public_path:'/creative-bridge/'+sha+'.webp'},
    {...ready, kind:'image', public_path:'/creative-bridge/'+sha+'.mp4'},
    {...ready, public_path:'/creative-bridge/'+sha+'.webp?token=fake'},
  ];
  for (const asset of invalid) {
    assert.equal(media.exports.safeCreativeMediaPath(asset), null);
    assert.equal(creativeStatus({ci:'PASSED', assets:[asset]}), 'reference_only');
  }
  assert.equal(creativeStatus({ci:'PASSED', assets:[ready, invalid[0]]}), 'reference_only');
  const movie = {...ready, kind:'video', public_path:'/creative-bridge/'+sha+'.mp4'};
  assert.equal(media.exports.safeCreativeMediaPath(movie), movie.public_path);
  assert.equal(creativeStatus({ci:'PASSED', assets:[ready, movie]}), 'imported');
});


test('SORA project cards translate provenance and display remote approval as unverified in EN/ES', () => {
  const page = fs.readFileSync('src/app/admin/creative-bridge/page.tsx','utf8');
  const pairs = [
    ["'Biblioteca','Library'", 'Biblioteca: {p.module}'],
    ["'Versión','Version'", ' · Versión: {p.version}'],
    ["'Procedencia declarada','Claimed provenance'", 'Procedencia: {p.settings?.creative?.provider'],
    ["'Aprobación y publicación remotas: no verificadas en esta pantalla.','Remote approval and publication: not verified on this screen.'", ''],
    ["'Cliente no visible','Client not visible'", ''],
    ["'Sin asignar · no se creó un lead','Unassigned · no lead was created'", ''],
    ["'Recursos registrados','Registered assets'", 'Recursos registrados: {'],
    ["'Última actualización','Last updated'", 'Última actualización: {'],
    ["'Rama','Branch'", 'Rama: {checkpoint.branch}'],
    ["'CI reportada','Reported CI'", 'CI reportada: {checkpoint.ci}'],
  ];
  for (const [bilingual, legacy] of pairs) {
    assert.ok(page.includes("pick(lang," + bilingual + ")"), 'Expected translated label: ' + bilingual);
    if (legacy) assert.equal(page.includes(legacy), false, 'Remove untranslated legacy label: ' + legacy);
  }
  // Keep stated provenance distinct from verified remote publication.
  assert.ok(page.includes("pick(lang,'Procedencia declarada','Claimed provenance')"));
  assert.ok(page.includes("pick(lang,'Aprobación y publicación remotas: no verificadas en esta pantalla.','Remote approval and publication: not verified on this screen.')"));
});
