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

test('only the newest GitHub activity response is rendered after iPhone tab resume', () => {
  assert.match(hq, /const activitySequence = useRef\(0\)/);
  assert.match(hq, /const sequence = \+\+activitySequence\.current/);
  assert.equal((hq.match(/sequence !== activitySequence\.current/g) || []).length, 2,
    'success and network error must both ignore superseded responses');
  assert.match(hq, /document\.addEventListener\("visibilitychange", onActivityVisibility\)/);
  assert.match(hq, /document\.removeEventListener\("visibilitychange", onActivityVisibility\)/);
  assert.match(hq, /activitySequence\.current\+\+; \/\/ Invalidate responses/);
  assert.match(hq, /if \(document\.visibilityState === "visible"\) void load\(\)/);
});


test('quick drag, pinch and cancelled pointer cannot raycast a workstation as a tap', () => {
  const ts = require('typescript');
  const js = ts.transpileModule(read('src/lib/office/hq-tap.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  const { isHqTap, trackHqPointerMove } = mod.exports;
  const start = { pointerId: 8, x: 100, y: 100, timeMs: 1000 };
  assert.equal(isHqTap(start, 8, 107, 108, 1080, 0), true, 'small quick movement is a tap');
  assert.equal(isHqTap(start, 8, 116, 100, 1080, 0), false, 'fast camera drag is not a tap');
  assert.equal(isHqTap(start, 8, 100, 100, 1100, 1), false, 'remaining second finger is a pinch');
  assert.equal(isHqTap(start, 9, 100, 100, 1100, 0), false, 'pointer mismatch rejected');
  assert.equal(isHqTap(start, 8, 100, 100, 1400, 0), false, 'long press is not station tap');
  assert.equal(isHqTap(null, 8, 100, 100, 1100, 0), false, 'cancelled gesture cannot select');
  const outAndBack = trackHqPointerMove(start, 8, 150, 100);
  assert.equal(outAndBack, null, 'drag farther than 12px cancels a tap permanently');
  assert.equal(isHqTap(outAndBack, 8, 100, 100, 1100, 0), false,
    'drag back to starting pixel must not pick a workstation');
  assert.equal(trackHqPointerMove(start, 8, 104, 103), start, 'small move is still a tap');
  assert.equal(trackHqPointerMove(start, 9, 160, 100), start, 'other pointer does not cancel own tap');
  assert.equal(trackHqPointerMove(start, 8, Number.NaN, 103), null, 'bad pointer coordinates fail closed');
  assert.match(hq, /addEventListener\("pointermove", onMove\)/);
  assert.match(hq, /removeEventListener\("pointermove", onMove\)/);
  assert.match(hq, /activePointers\.size === 1 && e\.isPrimary && e\.button === 0/);
  assert.match(hq, /isHqTap\(started, e\.pointerId/);
  assert.match(hq, /addEventListener\("pointercancel", onCancel\)/);
  assert.match(hq, /removeEventListener\("pointercancel", onCancel\)/);
});


test('lost pointer capture and Safari window blur clear stale workstation gestures', () => {
  assert.match(hq, /const onLostCapture = \(e: PointerEvent\) => \{ activePointers\.delete\(e\.pointerId\); tapStart = null; \}/);
  assert.match(hq, /const onWindowBlur = \(\) => \{ activePointers\.clear\(\); tapStart = null; \}/);
  assert.match(hq, /addEventListener\("lostpointercapture", onLostCapture\)/);
  assert.match(hq, /removeEventListener\("lostpointercapture", onLostCapture\)/);
  assert.match(hq, /window\.addEventListener\("blur", onWindowBlur\)/);
  assert.match(hq, /window\.removeEventListener\("blur", onWindowBlur\)/);
});

test('WebGL context loss on iPhone retains a ten-seat accessible light HQ', () => {
  assert.match(hq, /addEventListener\("webglcontextlost", onGraphicsLost\)/);
  assert.match(hq, /removeEventListener\("webglcontextlost", onGraphicsLost\)/);
  assert.match(hq, /event\.preventDefault\(\)/);
  assert.match(hq, /setGraphicsError\(true\); setLite\(true\)/);
  assert.match(hq, /graphicsError && <p className=\{styles\.graphicsWarning\} role="status">/);
  assert.match(sceneCss, /\.graphicsWarning \{/);
  assert.match(read('tests/office-hq.browser.cjs'), /hq-iphone-context-fallback\.png/);
});
