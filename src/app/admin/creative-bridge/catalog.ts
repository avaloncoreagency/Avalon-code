/** A UI label derived from a private checkpoint, not a remote Higgsfield attestation. */
export type CreativeCatalogState = 'imported' | 'pending' | 'blocked' | 'reference_only';
export type CatalogCheckpoint = {
  ci: string;
  assets: readonly { state: string; public_path?: string; sha256?: string | null }[];
};
export function creativeStatus(checkpoint: CatalogCheckpoint | null, invalidCheckpoint = false): CreativeCatalogState {
  if (invalidCheckpoint) return 'blocked';
  if (!checkpoint) return 'reference_only';
  if (checkpoint.ci === 'FAILED' || checkpoint.assets.some(a => a.state === 'failed' || a.state === 'cancelled')) return 'blocked';
  if (checkpoint.ci === 'PENDING' || checkpoint.assets.some(a => a.state === 'pending' || a.state === 'generating')) return 'pending';
  // "Imported" is a claimed durable local path, not independently checked bytes, license or vendor job.
  if (checkpoint.assets.length > 0 && checkpoint.assets.every(a => a.state === 'ready' &&
      typeof a.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(a.sha256) &&
      typeof a.public_path === 'string' && a.public_path.startsWith('/creative-bridge/' + a.sha256 + '.'))) return 'imported';
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
