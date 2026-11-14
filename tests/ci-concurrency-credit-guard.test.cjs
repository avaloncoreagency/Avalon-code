const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflows = ['auth-review.yml', 'crm.yml', 'os-modules.yml'];
test('expensive repeated CI workflows cancel outdated runs on the same PR only', () => {
  for (const name of workflows) {
    const content = fs.readFileSync(path.join(__dirname, '../.github/workflows', name), 'utf8');
    assert.match(content, /^concurrency:\s*$/m, name + ' must have job-level concurrency');
    assert.match(content, /^\s+group: .*github\.event\.pull_request\.number \|\| github\.ref/m, name + ' must isolate PRs and refs');
    assert.match(content, /^\s+cancel-in-progress: true\s*$/m, name + ' must cancel outdated builds');
    assert.match(content, /pull_request:/, name + ' still checks new PR commits');
    assert.match(content, /permissions:\s*\n\s+contents: read/, name + ' remains read-only');
  }
});
