const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDocsOnly } = require('../scripts/ci/docs-only.cjs');

test('only true documentation/instructions changes can skip full Auth Review CI', () => {
  assert.equal(isDocsOnly(['docs/overview.md', 'README.md', 'AGENTS.md']), true);
  assert.equal(isDocsOnly(['.codex/instructions.md', '.claude/AGENTS.md']), true);
  for (const changed of [
    [], ['src/app/page.tsx'], ['package.json'], ['next.config.ts'],
    ['tests/vercel-ignore-build.test.cjs'], ['.github/workflows/auth-review.yml'],
    ['docs/overview.md', 'src/lib/auth/session.ts'],
    ['docs/../src/app/page.tsx'], ['/docs/overview.md'], ['docs\\overview.md'],
    ['public/picture.png'], ['scripts/ci/docs-only.cjs']
  ]) assert.equal(isDocsOnly(changed), false, changed.join(','));
});

test('docs-only CLI reads a verified NUL-delimited diff, fails open on invalid input', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'avalon-docs-ci-')), 'changed');
  const cli = () => spawnSync(process.execPath, ['scripts/ci/docs-only.cjs', file], { encoding: 'utf8' });
  try {
    fs.writeFileSync(file, 'docs/overview.md\0README.md\0');
    let result = cli(); assert.equal(result.status, 0); assert.equal(result.stdout, 'true');
    fs.writeFileSync(file, 'docs/overview.md\0tests/radar.test.cjs\0');
    result = cli(); assert.equal(result.stdout, 'false');
    fs.writeFileSync(file, 'docs/overview.md\n');
    result = cli(); assert.equal(result.stdout, 'false');
  } finally { fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
});

test('workflow never trusts an altered CI classifier or workflow to bypass required checks', () => {
  const workflow = fs.readFileSync('.github/workflows/auth-review.yml', 'utf8');
  assert.match(workflow, /git diff --quiet "\$base_sha" HEAD -- scripts\/ci\/docs-only\.cjs \.github\/workflows\/auth-review\.yml/);
  assert.match(workflow, /if classified="\$\(node scripts\/ci\/docs-only\.cjs "\$changed"\)"/);
});
