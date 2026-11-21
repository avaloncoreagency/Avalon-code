const { test } = require('node:test');
const assert = require('node:assert/strict');
const { action, form } = require('./intake-boundary.cjs');
const root = process.env.FINAL_VALIDATION_ROOT || process.cwd();
test('synthetic probe: no consent never reaches the privileged intake role', async () => {
  const a = action(root);
  assert.equal((await a.submit({ status: 'idle' }, form({ consent: 'no' }))).status, 'invalid');
  assert.deepEqual(a.calls, { human: 0, rpc: 0, intake: 0 });
});
test('synthetic probe: oversized fields never reach intake', async () => {
  const a = action(root);
  assert.equal((await a.submit({ status: 'idle' }, form({ company: 'X'.repeat(201) }))).status, 'invalid');
  assert.equal(a.calls.rpc, 0);
});
test('synthetic probe: RPC failure is never reported as success', async () => {
  const a = action(root, { human: 'ok', networkFailure: true });
  assert.notEqual((await a.submit({ status: 'idle' }, form())).status, 'ok');
  assert.equal(a.calls.rpc, 1, 'reach the failing database after a valid synthetic human check');
});
// Human-check acceptance is a separate mandatory gate: node tests/final-validation/intake-boundary.cjs .
// This suite passing does not imply that gate passed.
