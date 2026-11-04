const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync('src/lib/office/hq-layout.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports, require);
const { HQ_STATIONS, stationView } = m.exports;
const act = (key, status, extra = {}) => ({ manager_key: key, run_id: 'r-' + key, status, task_title: 't', started_at: null, finished_at: null, result_summary: 'ok ' + key, evidence_refs: [], error_code: null, updated_at: null, ...extra });

test('ten stations: five managers in zone A, five reserved for Samuel in zone B', () => {
  assert.equal(HQ_STATIONS.length, 10);
  assert.deepEqual(HQ_STATIONS.filter(s => s.zone === 'A').map(s => s.manager), ['ren', 'shin', 'haru', 'sora', 'kenji']);
  const b = HQ_STATIONS.filter(s => s.zone === 'B');
  assert.equal(b.length, 5);
  assert.ok(b.every(s => s.kind === 'reserved' && !s.manager && s.role === 'Próxima incorporación — Equipo de Samuel'));
  assert.equal(new Set(HQ_STATIONS.map(s => `${s.x},${s.z}`)).size, 10, 'no two stations overlap');
});

test('only a genuinely running manager animates; reserved seats never show activity', () => {
  const rows = [act('ren', 'running'), act('shin', 'completed'), act('haru', 'failed', { error_code: 'executor_error' })];
  const v = id => stationView(HQ_STATIONS.find(s => s.id === id), rows);
  assert.equal(v('ren').animate, true);
  assert.equal(v('shin').animate, false); assert.equal(v('shin').headline, 'Completado');
  assert.equal(v('haru').error_code, 'executor_error');
  assert.equal(v('kenji').status, 'idle', 'no row → idle, never invented');
  for (const s of HQ_STATIONS.filter(s => s.kind === 'reserved')) {
    const r = stationView(s, rows.map(x => ({ ...x, status: 'running' })));
    assert.deepEqual([r.status, r.animate, r.run_id], ['reserved', false, null]);
  }
  assert.match(stationView(HQ_STATIONS[0], null).detail, /no disponible/, 'unreadable activity is said plainly');
});
