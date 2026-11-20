import { pick, formatDate, type Lang } from '@/lib/i18n';
import { DELIVERY_LABEL, DELIVERY_NOTE_REQUIRED, DELIVERY_STAGES, DELIVERY_TRANSITIONS, readDelivery } from '@/lib/os/delivery';
import type { ProjectRow } from '@/lib/os/data';
import { transitionDelivery } from '@/app/admin/workspace/products/actions';
import s from './client-hud.module.css';
import d from './delivery-panel.module.css';

const ERRORS: Record<string, [string, string]> = {
  delivery_invalid_transition: ['Ese cambio de etapa no está permitido.', 'That stage change is not allowed.'],
  delivery_note_required: ['Escribe una nota de al menos 8 caracteres (qué se entregó o cómo se verificó).', 'Write a note of at least 8 characters (what was delivered or how it was verified).'],
  delivery_url_required: ['Para marcarlo como publicado, el producto necesita una URL HTTPS en «Conexiones y archivos».', 'To mark it live, the product needs an HTTPS URL under “Connections and files”.'],
  delivery_evidence_required: ['Añade un enlace HTTPS de evidencia (la página revisada o una captura). Una URL sola no prueba que esté publicado.', 'Add an HTTPS evidence link (the reviewed page or a screenshot). A URL alone does not prove it is live.'],
  delivery_invalid_evidence: ['El enlace de evidencia debe empezar por https://.', 'The evidence link must start with https://.'],
  delivery_actor_mismatch: ['No se pudo verificar tu sesión. Vuelve a iniciar sesión.', 'Your session could not be verified. Sign in again.'],
  conflict: ['Otra persona cambió este producto. Recarga e inténtalo de nuevo.', 'Someone else changed this product. Reload and try again.'],
  archived: ['Producto archivado: no se puede cambiar la etapa.', 'Archived product: the stage cannot change.'],
};

/** Delivery lifecycle (8.2): where the product really is, and what it takes to move it forward. */
export function DeliveryPanel({ lang, project, ok, error }: { lang: Lang; project: ProjectRow; ok?: string; error?: string }) {
  const delivery = readDelivery(project.settings);
  const current = DELIVERY_STAGES.indexOf(delivery.stage);
  const next = DELIVERY_TRANSITIONS[delivery.stage];
  const op = project.settings.operations && typeof project.settings.operations === 'object' ? project.settings.operations as Record<string, unknown> : {};
  const hasUrl = typeof op.url === 'string' && op.url.startsWith('https://');
  const archived = project.status === 'archived';
  const message = error ? (Object.hasOwn(ERRORS, error) ? ERRORS[error] : ['No se pudo guardar la etapa.', 'The stage could not be saved.'] as [string, string]) : null;
  return <section className={s.panel} id="delivery" aria-labelledby="delivery-title">
    <h2 id="delivery-title">{pick(lang, 'Estado de entrega', 'Delivery status')}</h2>
    {ok && (DELIVERY_STAGES as readonly string[]).includes(ok) && <p className={s.notice} role="status">{pick(lang, 'Etapa actualizada a', 'Stage updated to')} «{pick(lang, ...DELIVERY_LABEL[ok as keyof typeof DELIVERY_LABEL])}».</p>}
    {message && <p className={s.notice} role="alert">{pick(lang, ...message)}</p>}
    <ol className={d.steps} aria-label={pick(lang, 'Etapas del producto', 'Product stages')}>
      {DELIVERY_STAGES.map((stage, i) => <li key={stage} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
        <span>{i + 1}</span>{pick(lang, ...DELIVERY_LABEL[stage])}</li>)}
    </ol>
    {delivery.stage === 'delivered' && !hasUrl && <p className={s.muted}>{pick(lang, 'Entregado, pero sin URL HTTPS registrada: todavía no puede marcarse como publicado.', 'Delivered, but no HTTPS URL is registered: it cannot be marked live yet.')}</p>}
    {archived ? <p className={s.muted}>{pick(lang, 'Producto archivado: solo lectura.', 'Archived product: read only.')}</p> :
      <div className={d.actions}>{next.map(to => <form key={to} action={transitionDelivery} className={d.action}>
        <input type="hidden" name="id" value={project.id} /><input type="hidden" name="version" value={project.version} /><input type="hidden" name="to" value={to} />
        <strong>{pick(lang, 'Pasar a', 'Move to')}: {pick(lang, ...DELIVERY_LABEL[to])}</strong>
        <label className={s.field}>{DELIVERY_NOTE_REQUIRED.includes(to) ? pick(lang, 'Nota (obligatoria)', 'Note (required)') : pick(lang, 'Nota (opcional)', 'Note (optional)')}
          <textarea name="note" rows={2} maxLength={1000} minLength={DELIVERY_NOTE_REQUIRED.includes(to) ? 8 : undefined} required={DELIVERY_NOTE_REQUIRED.includes(to)} /></label>
        {to === 'live_verified' && <label className={s.field}>{pick(lang, 'Enlace HTTPS de evidencia (página revisada o captura)', 'HTTPS evidence link (reviewed page or screenshot)')}
          <input name="evidence_url" type="url" inputMode="url" pattern="https://.*" required placeholder="https://" /></label>}
        <button type="submit" className={`${s.button} ${to === 'live_verified' || to === 'delivered' ? s.primary : ''}`}>{pick(lang, 'Confirmar', 'Confirm')}</button>
      </form>)}</div>}
    <details className={d.history}>
      <summary>{pick(lang, 'Historial de etapas', 'Stage history')} ({delivery.history.length})</summary>
      {delivery.history.length === 0 ? <p className={s.muted}>{pick(lang, 'Sin cambios todavía.', 'No changes yet.')}</p> :
        <ol>{[...delivery.history].reverse().map((e, i) => <li key={i}>
          <strong>{pick(lang, ...DELIVERY_LABEL[e.from])} → {pick(lang, ...DELIVERY_LABEL[e.to])}</strong> · {formatDate(lang, e.at)}
          {e.note && <><br /><small>{e.note}</small></>}
          {e.evidence_url && <><br /><a href={e.evidence_url} target="_blank" rel="noopener noreferrer">{pick(lang, 'Evidencia', 'Evidence')}</a></>}
        </li>)}</ol>}
    </details>
  </section>;
}
