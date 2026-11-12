const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('all external workflow actions use immutable SHA refs', () => {
  const dir = '.github/workflows';
  const workflows = fs.readdirSync(dir).filter(f => /\.ya?ml$/.test(f));
  assert.ok(workflows.length >= 10);
  let found = 0;
  for (const file of workflows) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const [, ref] of body.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
      found++;
      if (ref.startsWith('./')) continue;
      assert.match(ref, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, file + ': ' + ref);
    }
  }
  assert.ok(found >= 30);
});

test('security CI runs security, reporting and pins regressions', () => {
  const source = fs.readFileSync('.github/workflows/security.yml', 'utf8');
  for (const file of ['security.test.cjs','security-reporting.test.cjs','security-workflow-pins.test.cjs'])
    assert.ok(source.includes(file), file + ' missing from security workflow');
  const reviewJob = source.split('  dependency-review:')[1]?.split('  security-tests:')[0] || '';
  assert.ok(reviewJob.includes('fail-on-severity: high'), 'Dependency review must block high severity');
  assert.ok(!reviewJob.includes('continue-on-error:'), 'Dependency review must not be optional');
});

test('review ownership and private disclosure docs exist', () => {
  assert.match(fs.readFileSync('.github/CODEOWNERS','utf8'), /\* @avaloncoreagency/);
  assert.match(fs.readFileSync('.github/SECURITY.md','utf8'), /Private vulnerability reporting/);
});
