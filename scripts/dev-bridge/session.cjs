#!/usr/bin/env node
/*
 * Dev Bridge 3.0 — session CLI for Claude Code and Codex (any shell-capable agent).
 *
 *   npm run bridge:session -- start --title "Dev Bridge 3.0" [--department Engineering] [--issue 303]
 *   npm run bridge:session -- pause | resume | checkpoint [--note "..."]
 *   npm run bridge:session -- blocked --note "waiting for Samuel" | interrupted
 *   npm run bridge:session -- stop --summary "..." --next "..."
 *   npm run bridge:session -- event --kind test --title "npm test 1200/0" [--url https://...] [--ref <sha>]
 *   npm run bridge:session -- status | flush
 *
 * Environment (per agent, never committed): AVALON_BRIDGE_AGENT_TOKEN=avd_… issued by THAT agent's owner in
 * /admin/dev-bridge/ledger; AVALON_BRIDGE_URL (default https://avaloncoreagency.com).
 * Offline-safe: every command gets an idempotency key and is appended to .dev-bridge/outbox.jsonl first; `flush`
 * (run automatically by every command) resends pending items. Resending is harmless: the server deduplicates.
 * Records only what you send: no keystrokes, screenshots, file contents or chat transcripts.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve('.dev-bridge');
const outboxPath = path.join(root, 'outbox.jsonl');
const statePath = path.join(root, 'session.json');
const [command = 'status', ...args] = process.argv.slice(2);
const option = name => { const i = args.indexOf('--' + name); return i < 0 ? undefined : args[i + 1]; };
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
function write(f, data) { fs.mkdirSync(root, { recursive: true, mode: 0o700 }); const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, f); }
const outbox = () => fs.existsSync(outboxPath) ? fs.readFileSync(outboxPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const saveOutbox = items => { fs.mkdirSync(root, { recursive: true, mode: 0o700 }); fs.writeFileSync(outboxPath, items.map(i => JSON.stringify(i)).join('\n') + (items.length ? '\n' : ''), { mode: 0o600 }); };

const KINDS = { start: 'session_start', pause: 'session_pause', resume: 'session_resume', checkpoint: 'session_checkpoint', blocked: 'session_blocked', interrupted: 'session_interrupted', stop: 'session_stop' };
const ACTIVITY = ['commit', 'pull_request', 'review', 'issue', 'test', 'build', 'ci', 'handoff', 'document', 'fix', 'blocker', 'release', 'revert', 'decision', 'note'];

async function send(item, token, base, fetchImpl = fetch) {
  const res = await fetchImpl(base.replace(/\/$/, '') + '/api/dev-bridge/v1/events', {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(item.event),
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/** Sends pending items in order. Network/5xx failures stop the flush and keep the item; 4xx are permanent and reported. */
async function flush({ token, base, fetchImpl = fetch, state = read(statePath, {}) } = {}) {
  const items = outbox(), kept = [], report = [];
  let stop = false;
  for (const item of items) {
    if (stop) { kept.push(item); continue; }
    // A session started offline: resolve its local placeholder once the server assigned the real id.
    if (item.event.session_id && item.event.session_id.startsWith('pending:')) {
      const real = (state.resolved ?? {})[item.event.session_id];
      if (!real) { kept.push(item); continue; }
      item.event.session_id = real;
    }
    let r;
    try { r = await send(item, token, base, fetchImpl); } catch { r = { status: 0, body: {} }; }
    if (r.status === 0 || r.status >= 500 || r.status === 429) { kept.push(item); stop = true; continue; }
    if (r.status >= 400) { report.push({ key: item.event.idempotency_key, kind: item.event.kind, error: r.body.error ?? r.status }); continue; }
    if (item.event.kind === 'session_start' && r.body.sessionId) {
      state.resolved = { ...(state.resolved ?? {}), ['pending:' + item.event.idempotency_key]: r.body.sessionId };
      if (state.current === 'pending:' + item.event.idempotency_key) state.current = r.body.sessionId;
    }
    if (item.event.kind === 'session_stop' && state.current === (r.body.sessionId ?? item.event.session_id)) state.current = null;
    report.push({ key: item.event.idempotency_key, kind: item.event.kind, ok: true, replayed: r.body.replayed === true });
  }
  saveOutbox(kept);
  write(statePath, state);
  return { sent: report, pending: kept.length };
}

async function main() {
  const token = process.env.AVALON_BRIDGE_AGENT_TOKEN ?? '';
  const base = process.env.AVALON_BRIDGE_URL ?? 'https://avaloncoreagency.com';
  const state = read(statePath, {});
  if (command === 'status') { console.log(JSON.stringify({ current_session: state.current ?? null, pending_events: outbox().length, token_configured: /^avd_/.test(token) }, null, 2)); return; }
  if (!/^avd_[A-Za-z0-9_-]{20,80}$/.test(token)) throw Error('AVALON_BRIDGE_AGENT_TOKEN (avd_…) is not set. The agent owner issues it in /admin/dev-bridge/ledger.');
  if (command !== 'flush') {
    const kind = command === 'event' ? option('kind') : KINDS[command];
    if (!kind || (command === 'event' && !ACTIVITY.includes(kind))) throw Error(`Unknown command or kind. Use start|pause|resume|checkpoint|blocked|interrupted|stop|event --kind ${ACTIVITY.join('|')}`);
    const key = crypto.randomUUID();
    const event = { kind, idempotency_key: key, occurred_at: new Date().toISOString() };
    if (kind === 'session_start') {
      if (state.current) throw Error('A session is already open (' + state.current + '). Stop it first.');
      Object.assign(event, { title: option('title') ?? 'Sesión de trabajo', department: option('department') ?? '', issue_number: option('issue') ? Number(option('issue')) : undefined });
      state.current = 'pending:' + key;
    } else if (kind.startsWith('session_')) {
      if (!state.current) throw Error('No open session. Run `start` first.');
      event.session_id = state.current;
      if (option('note')) event.title = option('note').slice(0, 300);
      if (kind === 'session_stop') Object.assign(event, { summary: option('summary') ?? '', next_action: option('next') ?? '' });
    } else {
      Object.assign(event, { title: option('title') ?? kind, detail: option('detail') ?? '', evidence_url: option('url'), ref: option('ref') ?? '', issue_number: option('issue') ? Number(option('issue')) : undefined });
      if (state.current) event.session_id = state.current;
    }
    saveOutbox([...outbox(), { event, queued_at: new Date().toISOString() }]);
    write(statePath, state);
  }
  const result = await flush({ token, base, state });
  console.log(JSON.stringify({ current_session: state.current ?? null, ...result }, null, 2));
  if (result.pending) console.error(`${result.pending} event(s) kept offline; they will be resent by the next command or \`flush\`.`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { flush, send };
