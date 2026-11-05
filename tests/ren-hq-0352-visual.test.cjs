// REN HQ 0352-A — static source/asset contract, no network or customer data.
// Full browser validation is performed by tests/office-hq.browser.cjs with synthetic owner sessions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

const read = p => readFileSync(path.join(__dirname, '..', p), 'utf8');
const office = read('src/components/office/office.tsx');
const hq = read('src/components/office/hq-3d.tsx');
const manifest = read('src/lib/office/hq-assets.ts');
const layout = read('src/lib/office/hq-layout.ts');
const sceneCss = read('src/components/office/hq-3d.module.css');
const officeCss = read('src/components/office/office.module.css');

test('one official HQ 3D, legacy directory preserved without second IsoOffice scene', () => {
  const page = read('src/app/admin/workspace/crm/office/page.tsx');
  const hqPage = read('src/app/admin/workspace/crm/office/hq/page.tsx');
  assert.match(page, /redirect\("\/admin\/workspace\/crm\/office\/hq"\)/);
  assert.match(hqPage, /requireOwner\(\)/);
  assert.equal((office.match(/<Hq3d\b/g) || []).length, 1);
  assert.doesNotMatch(office, /IsoOffice/);
  for (const required of ['MemberPanel', 'ManagerPanel', 'Mensaje', 'Proyectos asignados', 'Tareas abiertas', 'office-activity']) {
    assert.ok(office.includes(required), 'preserve ' + required);
  }
});

test('Higgsfield models remain three verified optimized real GLBs, below the original 12 MiB gate', () => {
  const records = [...manifest.matchAll(/path:\s*"\/creative-bridge\/([a-f0-9]{64})\.glb",\s*sha256:\s*"([a-f0-9]{64})",\s*source_bytes:\s*(\d+),\s*bytes:\s*(\d+)/g)];
  assert.equal(records.length, 3, 'manager station, reserved pod and operations table');
  for (const match of records) {
    const [_, fileSha, declaredSha, _sourceBytes, declaredBytes] = match;
    assert.equal(fileSha, declaredSha, 'content-addressed file name must match manifest');
    const file = path.join(__dirname, '..', 'public/creative-bridge', fileSha + '.glb');
    const size = statSync(file).size;
    assert.equal(size, Number(declaredBytes), 'binary size must match manifest');
    assert.ok(size > 128 && size < 12 * 1024 * 1024, 'existing safety limit unchanged');
    assert.equal(readFileSync(file).toString('ascii', 0, 4), 'glTF', 'valid binary glTF magic');
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), declaredSha, 'binary content must match SHA-256');
  }
  assert.match(hq, /HQ_ASSETS\.station\.path/);
  assert.match(hq, /HQ_ASSETS\.pod\.path/);
  assert.match(hq, /HQ_ASSETS\.ops\.path/);
});

test('five manager seats and five inert reserved seats, no simulated managers', () => {
  assert.match(layout, /\["ren", "shin", "haru", "sora", "kenji"\]/);
  assert.match(layout, /\.\.\.\[0, 1, 2, 3, 4\]\.map/);
  assert.match(layout, /kind: "reserved"/);
  assert.match(layout, /animate: false/);
  assert.match(hq, /ACTIVITY_URL = "\/admin\/workspace\/crm\/office\/manager-activity"/);
  assert.match(hq, /sv\.animate/);
  assert.match(hq, /managerActivity|activityListener\.current\?\.\(next\)/);
});

test('the former Office uses HQ activity, not static offline flag or invented zero runs', () => {
  assert.match(hq, /onActivityChange\?: \(value: HqActivity \| null\) => void/);
  assert.match(hq, /activityListener\.current\?\.\(null\)/);
  assert.match(office, /onActivityChange=\{setManagerActivity\}/);
  assert.match(office, /managerActivity\.managers\.filter\(m => m\.run_id !== null\)/);
  assert.match(office, /execution\?\.run_id/);
  assert.doesNotMatch(office, /STATUS\[manager\.status\]|STATUS\[m\.status\]/);
  assert.doesNotMatch(office, /Avalon no tiene un backend de ejecución conectado/);
  assert.doesNotMatch(office, /<dt>\{t\("Terminadas", "Completed"\)\}<\/dt><dd>0<\/dd>/);
});

test('iPhone and keyboard controls remain accessible without new image or paid dependencies', () => {
  assert.match(hq, /aria-pressed=\{cameraPreset === p && !selected\}/);
  assert.match(hq, /role="group" aria-label="Oficina 3D:/);
  assert.match(hq, /api\.current\?\.preset\(p\)/);
  assert.match(hq, /cameraPresetRef\.current/);
  assert.match(hq, /prefers-reduced-motion: reduce/);
  assert.match(sceneCss, /env\(safe-area-inset-bottom/);
  assert.match(sceneCss, /\.cams button \{ min-height: 44px/);
  assert.match(sceneCss, /\.hq\[data-panel-open="true"\] \.cams/);
  assert.match(sceneCss, /\.statusStrip/);
  assert.match(officeCss, /\.quickNav a \{/);
  assert.match(office, /href="#office-directory"/);
  assert.match(office, /href="#office-kpis"/);
});
