// Operation Phoenix (2026-11-13): static guarantees that NO GitHub workflow can run REN or the managers autonomously.
// No network. Fails if anyone re-introduces a schedule, an autonomous job, AI secrets or write permissions for them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = '.github/workflows';
const files = fs.readdirSync(DIR).filter(f => /\.ya?ml$/.test(f));
const read = f => fs.readFileSync(path.join(DIR, f), 'utf8');
// Active (non-commented) lines only: paused workflows keep their old triggers as comments for history.
const active = text => text.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
const engine = active(read('ai-engine.yml'));

test('ai-engine.yml is CI only: no schedule, no autonomous jobs, no AI secrets, read-only', () => {
  assert.doesNotMatch(engine, /schedule:|cron:/, 'no scheduled trigger');
  assert.doesNotMatch(engine, /pull_request_target/);
  const jobs = [...engine.slice(engine.indexOf('\njobs:')).matchAll(/^  ([a-z][a-z0-9-]*):\s*$/gm)].map(m => m[1]);
  assert.deepEqual(jobs, ['offline'], 'only the offline CI job remains');
  assert.doesNotMatch(engine, /secrets\./, 'no secret is mapped into the engine CI');
  assert.doesNotMatch(engine, /(contents|pull-requests|issues):\s*write/, 'no write permission');
  assert.doesNotMatch(engine, /ren-dev-task|operate\.cjs|smoke\.cjs/, 'no autonomous script is invoked');
});

test('no workflow in the repository schedules REN, the managers, intake or Dev Bridge sync', () => {
  for (const f of files) {
    const text = active(read(f));
    if (/schedule:/.test(text)) {
      // The only allowed recurring run is the weekly CodeQL / security analysis.
      assert.equal(f, 'security.yml', `${f} must not have an active schedule`);
      assert.match(text, /cron:\s*"17 10 \* \* 1"/);
    }
    assert.doesNotMatch(text, /ren-dev-task|scripts\/ai-engine\/operate\.cjs|--mode (routine|intake)/, `${f} must not run REN or the managers`);
  }
  assert.ok(!fs.existsSync('scripts/ai-engine/ren-dev-task.cjs'), 'REN autonomous task script is retired');
});

test('paused automations stay manual-only (Dev Bridge sync, office managers)', () => {
  for (const f of ['dev-bridge-sync.yml', 'office-managers-free.yml']) {
    const text = active(read(f));
    assert.doesNotMatch(text, /schedule:|cron:/, `${f} has no active schedule`);
    assert.doesNotMatch(text, /^\s+push:/m, `${f} has no push trigger`);
    assert.match(text, /workflow_dispatch:/, `${f} can still be run by hand`);
  }
});
