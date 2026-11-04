// Persistent Higgsfield credit ledger for ONE authorized project (append-only JSONL in a PRIVATE path outside Git).
// reserve <ledger> <project> <cap> <request_id> <estimate>  → refuses if spent + open reservations + estimate > cap.
// settle  <ledger> <project> <request_id> <job_id> <actual>  → records real consumption (actual may differ from estimate).
// release <ledger> <project> <request_id>                     → frees a reservation whose job was never submitted.
// status  <ledger> <project> <cap>
// A request id can be reserved once and settled once, so retries and restarts never double-count or exceed the cap.
const fs = require('node:fs');
const {privatePath} = require('./private-files.cjs');
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{3,119}$/;
const num = v => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100000) throw Error('amount'); return Math.round(n * 100) / 100; };

function load(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function totals(entries, project) {
  const mine = entries.filter(e => e.project === project);
  const settled = new Map(mine.filter(e => e.type === 'settle').map(e => [e.request_id, e]));
  const released = new Set(mine.filter(e => e.type === 'release').map(e => e.request_id));
  const reserved = mine.filter(e => e.type === 'reserve');
  const spent = [...settled.values()].reduce((s, e) => s + e.actual, 0);
  const open = reserved.filter(e => !settled.has(e.request_id) && !released.has(e.request_id)).reduce((s, e) => s + e.estimate, 0);
  return { spent: Math.round(spent * 100) / 100, open: Math.round(open * 100) / 100, reserved, settled, released };
}
function append(file, entry) {
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeSync(fd, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n'); } finally { fs.closeSync(fd); }
}
function run([cmd, ledger, project, ...args]) {
  if (!ID.test(project || '')) throw Error('project');
  const file = privatePath(ledger);
  const entries = load(file);
  const t = totals(entries, project);
  if (cmd === 'status') { const cap = num(args[0]); return { project, cap, spent: t.spent, reserved_open: t.open, remaining: Math.round((cap - t.spent - t.open) * 100) / 100 }; }
  if (cmd === 'reserve') {
    const [capRaw, requestId, estimateRaw] = args; const cap = num(capRaw), estimate = num(estimateRaw);
    if (!ID.test(requestId || '')) throw Error('request');
    if (t.reserved.some(e => e.request_id === requestId)) return { ok: true, replayed: true };
    if (t.spent + t.open + estimate > cap) throw Error('budget_exceeded');
    append(file, { type: 'reserve', project, request_id: requestId, estimate });
    return { ok: true, remaining_after: Math.round((cap - t.spent - t.open - estimate) * 100) / 100 };
  }
  if (cmd === 'settle') {
    const [requestId, jobId, actualRaw] = args; const actual = num(actualRaw);
    if (!t.reserved.some(e => e.request_id === requestId)) throw Error('not_reserved');
    if (t.settled.has(requestId)) return { ok: true, replayed: true };
    if (!ID.test(jobId || '')) throw Error('job');
    append(file, { type: 'settle', project, request_id: requestId, job_id: jobId, actual });
    return { ok: true };
  }
  if (cmd === 'release') {
    const [requestId] = args;
    if (!t.reserved.some(e => e.request_id === requestId) || t.settled.has(requestId)) throw Error('not_releasable');
    if (!t.released.has(requestId)) append(file, { type: 'release', project, request_id: requestId });
    return { ok: true };
  }
  throw Error('usage');
}
if (require.main === module) {
  try { console.log(JSON.stringify(run(process.argv.slice(2)))); }
  catch (e) { console.error('budget: ' + e.message); process.exit(2); }
}
module.exports = { run };
