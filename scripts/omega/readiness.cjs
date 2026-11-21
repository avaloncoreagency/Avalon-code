'use strict';
// Offline evidence review, never a database client or a release/deployment command.
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED = ['unit', 'database_negative', 'browser', 'two_owner_persistence', 'tenant_isolation', 'backup_restore'];
function assessReadiness(input, now = new Date()) {
  if (!input || !SHA.test(input.candidateSha || '') || !Number.isFinite(now.getTime())) throw Error('invalid_evidence');
  const blocked = [];
  const inventory = input.sourceMigrations;
  const ledger = input.remoteMigrations;
  if (!Array.isArray(inventory) || !inventory.length || !inventory.every(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)) || new Set(inventory).size !== inventory.length) throw Error('invalid_source_inventory');
  if (!Array.isArray(ledger) || !ledger.length || !ledger.every(r => /^\d{14}$/.test(r.version) && /^[a-z0-9_]+$/.test(r.name)) || new Set(ledger.map(r => r.version)).size !== ledger.length) throw Error('invalid_remote_ledger');
  const lastSource = [...inventory].sort().at(-1).slice(0, 14);
  const newer = ledger.filter(r => r.version > lastSource).map(r => ({ version: r.version, name: r.name }));
  if (newer.length) blocked.push('remote_migrations_newer_than_source');
  // Historical remote migrations may combine/rename local files. Count equality NEVER proves SQL body equality.
  if (!input.schemaCorrespondence || input.schemaCorrespondence.sha !== input.candidateSha || input.schemaCorrespondence.status !== 'passed') blocked.push('schema_correspondence_unverified');
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  for (const kind of REQUIRED) {
    const matching = evidence.filter(e => e && e.kind === kind && e.sha === input.candidateSha);
    if (matching.length !== 1) { blocked.push(kind + '_missing_or_ambiguous'); continue; }
    const e = matching[0], at = Date.parse(e.observedAt);
    if (e.status !== 'passed' || e.environment !== 'isolated' || typeof e.ref !== 'string' || !/^[a-zA-Z0-9_:/.-]{1,200}$/.test(e.ref) || !Number.isFinite(at) || at > now.getTime() || now.getTime() - at > 86400000) blocked.push(kind + '_not_verified');
  }
  if (input.commercialHostingPlan !== 'verified_allowed') blocked.push('commercial_hosting_plan_unverified');
  if (input.radar !== 'verified_paused') blocked.push('radar_pause_unverified');
  return { candidateSha: input.candidateSha, assessedAt: now.toISOString(), status: blocked.length ? 'BLOCKED' : 'READY_FOR_HUMAN_REVIEW', blocked,
    sourceMigrationCount: inventory.length, remoteMigrationCount: ledger.length, newerRemoteMigrations: newer,
    schemaProof: 'Separate reviewed schema/body correspondence required; ledger counts are not SQL hashes.',
    releaseAuthorized: false, cost: 'no medido' };
}
if (require.main === module) {
  try { const fs = require('node:fs'); const result = assessReadiness(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'BLOCKED' ? 2 : 0; }
  catch { console.error('Invalid evidence file; no release action performed.'); process.exitCode = 1; }
}
module.exports = { assessReadiness, REQUIRED };
