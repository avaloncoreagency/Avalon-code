import 'server-only';
import { Api, config, freshness, resume, sync, type Owner, type Snapshot } from './core';
import Ajv from 'ajv';
import resumeSchema from '../../../schemas/dev-bridge/resume-package.schema.json';

// Organization metadata shared only AFTER owner authorization. This is a bounded
// per-instance cache, not durable storage. Actions artifacts hold durable state.
let last: Snapshot | undefined;
let pending: Promise<Snapshot> | undefined;
let resumeCheckedAt = 0;
const validate = new Ajv().compile(resumeSchema);
export async function snapshot(): Promise<Snapshot> {
  // Tokenless public summaries are rate-limited by GitHub. Cache them longer.
  const ttl = config().githubToken ? 300_000 : 900_000;
  if (last && Date.now() - Date.parse(last.at) < ttl) return last;
  if (pending) return pending;
  pending = sync(config(), last).then(value => { last = value; return value; }).finally(() => { pending = undefined; });
  return pending;
}
export async function packageFor(issue: number, owner: Owner) {
  if (Date.now() - resumeCheckedAt < 10_000) throw Error('Espera diez segundos antes de generar otro paquete.');
  resumeCheckedAt = Date.now();
  const c = config();
  if (!c.githubToken) throw Error('El resumen público de GitHub no permite transferencias. Configura acceso de solo lectura para generar el paquete.');
  const s = await snapshot();
  if (freshness(s.github).status !== 'VERIFIED') throw Error('GitHub no está verificado; no se puede reanudar con seguridad.');
  const p = s.github.data?.pulls.find(p => p.issues.includes(issue));
  if (!p) throw Error('Vincula la Issue desde un PR abierto con Refs #n.');
  const branch = await new Api('https://api.github.com', c.githubToken ?? '').get(`/repos/${c.repo}/branches/${encodeURIComponent(p.branch)}`) as {commit:{sha:string}};
  const pkg = resume(s, issue, owner, c.repo, branch.commit.sha);
  if (!validate(pkg)) throw Error('El paquete no cumple el esquema; regenera la sincronización.');
  return pkg;
}
