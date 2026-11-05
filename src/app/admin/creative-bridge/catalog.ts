import type { Asset } from '@/lib/creative-bridge/continuity';
import { safeCreativeMediaPath } from './media-safety';

/** A UI label derived from a private checkpoint, not a remote Higgsfield attestation. */
export type CreativeCatalogState = 'imported' | 'pending' | 'blocked' | 'reference_only';
export type CatalogCheckpoint = {
  ci: string;
  assets: readonly Asset[];
};
export function creativeStatus(checkpoint: CatalogCheckpoint | null, invalidCheckpoint = false): CreativeCatalogState {
  if (invalidCheckpoint) return 'blocked';
  if (!checkpoint) return 'reference_only';
  if (checkpoint.ci === 'FAILED' || checkpoint.assets.some(a => a.state === 'failed' || a.state === 'cancelled')) return 'blocked';
  if (checkpoint.ci === 'PENDING' || checkpoint.assets.some(a => a.state === 'pending' || a.state === 'generating')) return 'pending';
  // Keep the catalog aligned with the preview's local-path/kind allowlist: a GLB, a
  // mismatched extension or a URL with parameters cannot be labelled imported.
  // Passing this check still does NOT attest file bytes, license or remote publication.
  if (checkpoint.assets.length > 0 && checkpoint.assets.every(a => safeCreativeMediaPath(a) !== null)) return 'imported';
  return 'reference_only';
}
export type CatalogRow<T> = { project: T; status: CreativeCatalogState };
export function filterLibrary<T extends { name?: string | null; settings?: { operations?: { client_lead_id?: unknown } } }>(
  rows: readonly CatalogRow<T>[], filters: { q?: unknown; state?: unknown; client?: unknown },
): CatalogRow<T>[] {
  const q = typeof filters.q === 'string' ? filters.q.trim().slice(0, 80).toLocaleLowerCase() : '';
  const state = typeof filters.state === 'string' && ['imported', 'pending', 'blocked', 'reference_only'].includes(filters.state)
    ? filters.state : '';
  const client = typeof filters.client === 'string' && filters.client.length <= 64 ? filters.client : '';
  return rows.filter(row => {
    const lead = row.project.settings?.operations?.client_lead_id;
    return (!q || (typeof row.project.name === 'string' && row.project.name.toLocaleLowerCase().includes(q))) &&
      (!state || row.status === state) && (!client || (client === 'unassigned' ? !lead : lead === client));
  });
}

/** A status name describes a local manifest assertion, not remote verification. */
export function creativeStatusLabel(state: CreativeCatalogState, lang: 'es' | 'en'): string {
  const labels: Record<CreativeCatalogState, readonly [string, string]> = {
    imported: ['Ruta local registrada (sin verificar)', 'Registered local path (unverified)'],
    pending: ['Pendiente', 'Pending'],
    blocked: ['Bloqueado', 'Blocked'],
    reference_only: ['Solo referencia', 'Reference only'],
  };
  return labels[state][lang === 'en' ? 1 : 0];
}
