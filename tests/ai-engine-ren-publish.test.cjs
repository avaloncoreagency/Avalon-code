// REN publishing: draft PR creation is idempotent, errors are reported verbatim, and one finished task never blocks the next.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const REN = require('../scripts/ai-engine/ren-dev-task.cjs');

function withFakeGh(script, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-ren-'));
  fs.writeFileSync(path.join(dir, 'gh'), '#!/usr/bin/env node\n' + script, { mode: 0o755 });
  const saved = process.env.PATH; process.env.PATH = dir + path.delimiter + saved;
  try { return fn(dir); } finally { process.env.PATH = saved; fs.rmSync(dir, { recursive: true, force: true }); }
}

test('draft PR: success returns the URL, "already exists" is an idempotent success, other errors are surfaced', () => {
  withFakeGh(`process.stdout.write('https://github.com/avaloncoreagency/Avalon-code/pull/777\\n')`, () =>
    assert.deepEqual(REN.createDraftPr('ren/auto-x', 't', 'b'), { url: 'https://github.com/avaloncoreagency/Avalon-code/pull/777' }));
  withFakeGh(`process.stderr.write('a pull request for branch "ren/auto-x" into branch "main" already exists:\\nhttps://github.com/avaloncoreagency/Avalon-code/pull/138\\n');process.exit(1)`, () =>
    assert.deepEqual(REN.createDraftPr('ren/auto-x', 't', 'b'), { url: 'https://github.com/avaloncoreagency/Avalon-code/pull/138', existing: true }));
  withFakeGh(`process.stderr.write('GraphQL: GitHub Actions is not permitted to create or approve pull requests (createPullRequest)\\n');process.exit(1)`, () => {
    const r = REN.createDraftPr('ren/auto-x', 't', 'b');
    assert.match(r.error, /not permitted to create or approve pull requests/);
    assert.equal(r.url, undefined);
  });
  // The draft flag, base and head are fixed: REN can never open a ready-for-review PR or target another base.
  withFakeGh(`require('fs').writeFileSync(process.env.ARGS_FILE, JSON.stringify(process.argv.slice(2)));process.stdout.write('https://github.com/a/b/pull/1')`, dir => {
    process.env.ARGS_FILE = path.join(dir, 'args.json');
    REN.createDraftPr('ren/auto-y', 'titulo', 'cuerpo');
    const a = JSON.parse(fs.readFileSync(process.env.ARGS_FILE, 'utf8'));
    assert.ok(a.includes('--draft') && a[a.indexOf('--base') + 1] === 'main' && a[a.indexOf('--head') + 1] === 'ren/auto-y');
    assert.ok(!a.includes('--auto') && !a.includes('merge'));
  });
});

test('task ids: a finished task opens the next one (max 3 per day); an unfinished one is resumed; legacy id counts as task 1', () => {
  const day = '2026-11-05', t = status => ({ status });
  assert.deepEqual(REN.nextRunId({ tasks: {} }, day), { id: 'ren-dev:2026-11-05:1', n: 1 });
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-05': t('succeeded') } }, day).id, 'ren-dev:2026-11-05:2', 'legacy id finished → task 2');
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-05': t('failed') } }, day).id, 'ren-dev:2026-11-05', 'legacy id unfinished → resumed');
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-05:1': t('succeeded'), 'ren-dev:2026-11-05:2': t('running') } }, day).id, 'ren-dev:2026-11-05:2');
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-05:1': t('succeeded'), 'ren-dev:2026-11-05:2': t('succeeded'), 'ren-dev:2026-11-05:3': t('succeeded') } }, day).id, null, 'daily cap');
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-05:1': { status: 'failed', tries: 3 } } }, day).id, 'ren-dev:2026-11-05:2', 'a task that failed 3 times is abandoned, not retried forever');
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-05:1': { status: 'failed', tries: 2 } } }, day).id, 'ren-dev:2026-11-05:1');
  assert.equal(REN.nextRunId({ tasks: { 'ren-dev:2026-11-04:1': t('succeeded') } }, day).id, 'ren-dev:2026-11-05:1', 'other days do not count');
});
