'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { bridgeReadiness } = require('../scripts/bridge-health/health.cjs');

test('bridge readiness never leaks credentials or claims verified health', () => {
  const env = {
    BRIDGE_GITHUB_TOKEN: 'secret-github-123',
    BRIDGE_VERCEL_TOKEN: 'secret-vercel-123',
    BRIDGE_VERCEL_PROJECT: 'project123',
    BRIDGE_VERCEL_TEAM: 'team123',
    BRIDGE_SUPABASE_TOKEN: 'secret-supabase-123',
    BRIDGE_SUPABASE_REF: 'someprojectref',
    AVALON_VERCEL_DEPLOY_TOKEN: 'secret-client-vercel-123',
    AVALON_CREATIVE_BRIDGE_KEYS_JSON: '{"secret_b64":"secret-private"}',
    AVALON_CREATIVE_BRIDGE_OWNER_ID: 'uuid-owner',
    AVALON_CREATIVE_BRIDGE_MACHINE_EMAIL: 'machine@example.invalid',
    AVALON_CREATIVE_BRIDGE_MACHINE_PASSWORD: 'secret-machine-password',
    NEXT_PUBLIC_SUPABASE_URL: 'https://isolated.example.invalid',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'secret-public-key',
    AVALON_CREATIVE_BRIDGE_ENABLED: 'true',
  };
  const report = bridgeReadiness(env);
  assert.equal(report.live_provider_health, 'UNKNOWN');
  assert.equal(report.connections.dev_bridge.github, 'CONFIGURED_UNVERIFIED');
  assert.equal(report.connections.creative_bridge.registration, 'CONFIGURED_UNVERIFIED');
  assert.equal(report.connections.higgsfield.delivery, 'UNKNOWN_REQUIRES_ARTIFACT_AND_PERMISSION_EVIDENCE');
  const output = JSON.stringify(report);
  for (const value of Object.values(env)) if (value.length > 12) assert.ok(!output.includes(value));
});

test('incomplete and disabled bridges are not reported healthy', () => {
  const report = bridgeReadiness({
    AVALON_CREATIVE_BRIDGE_ENABLED: 'true',
    AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED: 'true',
    AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS: 'true',
  });
  assert.equal(report.connections.project_bridge.import_storage, 'MISSING_CONFIGURATION');
  assert.equal(report.connections.dev_bridge.handoff, 'UNAVAILABLE_NO_AUTH');
  assert.equal(report.connections.creative_bridge.registration, 'MISSING_CONFIGURATION');
  assert.equal(report.warnings.length, 3);
  assert.equal(bridgeReadiness({}).connections.creative_bridge.registration, 'DISABLED');
});

test('project sender rejects malformed CLI args before network access', () => {
  const path = 'scripts/project-bridge/send-project.mjs';
  const bad = [
    ['--url', 'https://avaloncoreagency.com'],
    ['sample.zip', '--url', 'https://user:password@avaloncoreagency.com'],
    ['sample.zip', '--url', 'https://avaloncoreagency.com/?token=abc'],
    ['sample.zip', '--unknown', 'x'],
  ];
  for (const args of bad) {
    const child = spawnSync(process.execPath, [path, ...args], {
      encoding: 'utf8', env: { PATH: process.env.PATH, AVALON_BRIDGE_TOKEN: 'avb_' + 'a'.repeat(40) }, timeout: 5000,
    });
    assert.equal(child.status, 2, args.join(' '));
    assert.ok(!child.stderr.includes('avb_' + 'a'.repeat(40)));
  }
});
