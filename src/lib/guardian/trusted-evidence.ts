/** Offline signed-receipt preflight only. This does not authenticate the calling user or grant incident closure. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyRecovery, type Context, type Incident, type Observation } from './diagnostics';

export type MonitorRegistration = Readonly<{
  id: string;
  clientId: string;
  projectId: string;
  targetId: string;
  keyVersion: number;
  active: boolean;
  signingKey: Uint8Array;
}>;
export type SignedObservation = Readonly<{
  incidentId: string;
  targetId: string;
  keyVersion: number;
  observation: Observation;
  signature: string;
}>;
export type ReceiptSource = ReadonlyMap<string, MonitorRegistration>;

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SIGNATURE = /^[a-f0-9]{64}$/;
/** Stable signature payload; never incorporate arbitrary ticket text or external URLs. */
function payload(r: SignedObservation): string {
  const o = r.observation;
  return JSON.stringify([
    'avalon-guardian-receipt-v1', r.incidentId, r.targetId, r.keyVersion,
    o.id, o.clientId, o.projectId, o.code, o.observedAt, o.observerId,
  ]);
}
function sameObservation(a: Observation, b: Observation): boolean {
  return a.id === b.id && a.clientId === b.clientId && a.projectId === b.projectId &&
    a.code === b.code && a.observedAt === b.observedAt && a.observerId === b.observerId;
}
function authentic(r: SignedObservation, incident: Incident, context: Context, targetId: string, sources: ReceiptSource): boolean {
  if (!r || !r.observation || typeof r.signature !== 'string' || !SIGNATURE.test(r.signature) ||
      r.incidentId !== incident.id || r.targetId !== targetId || !Number.isSafeInteger(r.keyVersion) || r.keyVersion < 1) return false;
  const o = r.observation;
  if (!UUID.test(o.observerId) || o.clientId !== context.clientId || o.projectId !== context.projectId) return false;
  const monitor = sources.get(o.observerId);
  if (!monitor || !monitor.active || monitor.id !== o.observerId || monitor.clientId !== context.clientId ||
      monitor.projectId !== context.projectId || monitor.targetId !== targetId || monitor.keyVersion !== r.keyVersion ||
      !(monitor.signingKey instanceof Uint8Array) || monitor.signingKey.byteLength < 32) return false;
  const actual = createHmac('sha256', monitor.signingKey).update(payload(r), 'utf8').digest();
  const supplied = Buffer.from(r.signature, 'hex');
  return supplied.byteLength === actual.byteLength && timingSafeEqual(supplied, actual);
}

/**
 * A reviewed server adapter must load monitor keys and the incident target from trusted storage.
 * This helper has no replay ledger, no provider connection and NO permission to close incidents.
 */
export function preflightSignedRecovery(incident: Incident, failures: SignedObservation[], after: SignedObservation[],
  context: Context, targetId: string, registeredSources: ReceiptSource) {
  const denied = { status: 'UNVERIFIED' as const, closeAuthorized: false as const, replayLedgerVerified: false as const };
  if (!UUID.test(targetId) || !registeredSources || !(registeredSources instanceof Map) ||
      !Array.isArray(failures) || !Array.isArray(after) || failures.length !== incident?.observations?.length ||
      failures.length < 2 || failures.length > 5 || after.length < 2 || after.length > 5) return denied;
  const original = new Map(incident.observations.map(o => [o.id, o]));
  if (original.size !== failures.length) return denied;
  const unique = new Set<string>();
  for (const r of [...failures, ...after]) {
    if (!authentic(r, incident, context, targetId, registeredSources) || unique.has(r.observation.id)) return denied;
    unique.add(r.observation.id);
  }
  for (const r of failures) {
    const expected = original.get(r.observation.id);
    if (!expected || !sameObservation(expected, r.observation)) return denied;
  }
  // Generic probes remain restricted by the existing runbook-specific verification gate.
  try {
    const result = verifyRecovery(incident, after.map(r => r.observation), context);
    if (result.status !== 'VERIFIED_FOR_OWNER_REVIEW') return denied;
    // Cryptographic origin alone is insufficient: persistent replay checking, owner approval and
    // domain-specific checks remain mandatory in the future server adapter.
    return { status: 'SIGNED_EVIDENCE_CANDIDATE' as const, closeAuthorized: false as const,
      replayLedgerVerified: false as const };
  } catch {
    return denied;
  }
}
