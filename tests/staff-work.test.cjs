// Staff work calendar helpers (pure): DST-safe local→UTC, calendar grids, KPIs from real records only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const out = ts.transpileModule(fs.readFileSync('src/lib/staff/work.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, require); const w = m.exports;

test('local time → UTC respects daylight saving in the item time zone', () => {
  assert.equal(w.localToUtc('2026-07-01', '09:00', 'America/New_York'), '2026-07-01T13:00:00.000Z', 'EDT = UTC-4');
  assert.equal(w.localToUtc('2026-12-01', '09:00', 'America/New_York'), '2026-12-01T14:00:00.000Z', 'EST = UTC-5');
  assert.equal(w.localToUtc('2026-11-01', '03:00', 'America/New_York'), '2026-11-01T08:00:00.000Z', 'after the fall-back change');
  assert.equal(w.localToUtc('2026-12-01', '09:00', 'Europe/Madrid'), '2026-12-01T08:00:00.000Z');
  for (const bad of [['2026-13-01', '09:00'], ['2026-12-01', '25:00'], ['x', '09:00']]) assert.equal(w.localToUtc(bad[0], bad[1], 'America/New_York'), null);
  assert.equal(w.localToUtc('2026-12-01', '09:00', 'Not/AZone'), null);
  assert.equal(w.dayKey('2026-12-01T03:30:00.000Z', 'America/New_York'), '2026-11-30', 'day bucket uses the local date');
});

test('calendar grids: month in whole Monday-first weeks, week of 7 days, day of 1', () => {
  const month = w.viewDays('month', '2026-12-15');
  assert.equal(month.length % 7, 0); assert.equal(month[0], '2026-11-30'); assert.ok(month.includes('2026-12-31'));
  assert.deepEqual(w.viewDays('week', '2026-12-10'), ['2026-12-07', '2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12', '2026-12-13']);
  assert.deepEqual(w.viewDays('day', '2026-12-10'), ['2026-12-10']);
  assert.equal(w.shiftAnchor('month', '2026-12-31', 1), '2027-01-01');
  assert.equal(w.shiftAnchor('week', '2026-12-10', -1), '2026-12-03');
});

test('KPIs come only from the given records; cancelled work never counts; empty input is an honest zero', () => {
  const now = '2026-12-10T15:00:00.000Z';
  const item = (o) => ({ id: Math.random().toString(), kind: 'task', origin: 'staff_assigned', assignee_id: 'a', created_by: 'o', title: 't', instructions: '', starts_at: null, ends_at: null,
    due_at: null, time_zone: 'America/New_York', priority: 'normal', status: 'todo', lead_id: null, client_id: null, assignee_can_reschedule: false, completion_note: '', completed_at: null, version: 1, updated_at: now, ...o });
  const k = w.workKpis([
    item({ due_at: '2026-12-09T12:00:00.000Z' }),
    item({ kind: 'appointment', starts_at: '2026-12-12T15:00:00.000Z' }),
    item({ kind: 'follow_up', origin: 'staff_created', status: 'done', completed_at: '2026-12-05T10:00:00.000Z', lead_id: 'L1', due_at: '2026-12-05T10:00:00.000Z' }),
    item({ status: 'cancelled', due_at: '2026-12-01T10:00:00.000Z' }),
  ], now, { leads: 2, clients: 1, casefilesOpen: 0 });
  assert.deepEqual({ assigned: k.assigned, open: k.open, overdue: k.overdue, upcoming7: k.upcoming7, done30: k.done30, appts: k.appointmentsScheduled, fu: k.followUpsDone, worked: k.leadsWorked },
    { assigned: 2, open: 2, overdue: 1, upcoming7: 1, done30: 1, appts: 1, fu: 1, worked: 1 });
  const zero = w.workKpis([], now, { leads: 0, clients: 0, casefilesOpen: 0 });
  assert.ok(Object.values(zero).every(v => v === 0));
});
