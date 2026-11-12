'use client';
// Persistence shell around Codex's Nova WebsiteEditor (unchanged). The editor stays a controlled, memory-only
// component; this shell tracks which pages changed, saves them through an owner-only server action with optimistic
// version control, shows the save state and warns before leaving with unsaved changes.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { NovaSurface, StatusBadge, type NovaLanguage, type NovaStatus } from '@/components/avalon-ui/nova';
import { WebsiteEditor } from '@/components/avalon-ui/builders/website-editor';
import type { WebsitePage } from '@/components/avalon-ui/builders/contracts';
import s from '@/components/avalon-ui/builders/builders.module.css';
import { saveWebsiteStudio, type StudioSaveResult } from '@/app/admin/workspace/website-designer/studio-actions';

export type StudioPage = WebsitePage & { version: number };
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

const BADGE: Record<SaveState, NovaStatus> = { saved: 'completed', dirty: 'idle', saving: 'running', error: 'failed', conflict: 'blocked' };
const fingerprint = (p: WebsitePage) => JSON.stringify([p.title, p.blocks]);

export function WebsiteStudio({ projectId, projectName, initialPages, lang }: { projectId: string; projectName: string; initialPages: StudioPage[]; lang: NovaLanguage }) {
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const [pages, setPages] = useState<WebsitePage[]>(() => initialPages.map(({ id, title, blocks }) => ({ id, title, blocks })));
  // Last version and content known to be stored in the database, per page. Pages created in the editor have version null.
  const stored = useRef(new Map(initialPages.map(p => [p.id, { version: p.version as number | null, print: fingerprint(p) }])));
  const [state, setState] = useState<SaveState>('saved');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const changed = useCallback((list: WebsitePage[]) => list.filter(p => stored.current.get(p.id)?.print !== fingerprint(p)), []);
  const dirty = changed(pages).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onChange = (next: WebsitePage[]) => { setPages(next); setState('dirty'); setMessage(''); };

  const save = () => {
    const todo = changed(pages);
    if (!todo.length) { setState('saved'); return; }
    setState('saving'); setMessage('');
    startTransition(async () => {
      let result: StudioSaveResult;
      try {
        result = await saveWebsiteStudio(projectId, todo.map(p => ({ id: p.id, title: p.title, blocks: p.blocks, version: stored.current.get(p.id)?.version ?? null })));
      } catch {
        setState('error'); setMessage(t('No se pudo conectar con el servidor. Tus cambios siguen en pantalla; vuelve a intentarlo.', 'Could not reach the server. Your changes are still on screen; try again.'));
        return;
      }
      for (const r of result.pages) {
        if (!r.ok) continue;
        const page = todo.find(p => p.id === r.id);
        if (page) stored.current.set(r.id, { version: r.version, print: fingerprint(page) });
      }
      if (result.ok) { setState('saved'); setMessage(t('Guardado en Avalon. Puedes recargar: los cambios se recuperan.', 'Saved to Avalon. You can reload: changes are recovered.')); return; }
      const conflict = result.pages.some(r => !r.ok && r.error === 'conflict');
      setState(conflict ? 'conflict' : 'error');
      const failed = result.pages.filter(r => !r.ok).length;
      setMessage(conflict
        ? t('Otra sesión cambió esta página. Recarga para ver la última versión (copia antes lo que quieras conservar).', 'Another session changed this page. Reload to get the latest version (copy anything you want to keep first).')
        : t(`No se guardó (${result.error ?? failed + ' página(s)'}). Revisa los campos: los enlaces deben ser seguros y cada botón necesita texto y enlace.`, `Not saved (${result.error ?? failed + ' page(s)'}). Check the fields: links must be safe and each button needs both label and link.`));
    });
  };

  const shown: SaveState = pending ? 'saving' : state === 'saved' && dirty ? 'dirty' : state;
  const label = { saved: t('Guardado', 'Saved'), dirty: t('Cambios sin guardar', 'Unsaved changes'), saving: t('Guardando…', 'Saving…'), error: t('Error al guardar', 'Save failed'), conflict: t('Conflicto de versión', 'Version conflict') }[shown];

  return (
    <NovaSurface label={`Website Designer · ${projectName}`}>
      <div className={s.builder} data-save-state={shown}>
        <div className={s.tools}>
          <StatusBadge status={BADGE[shown]} lang={lang} />
          <strong role="status" aria-live="polite" data-testid="save-state">{label}</strong>
          <button type="button" onClick={save} disabled={pending || !dirty} data-testid="studio-save">{t('Guardar en Avalon', 'Save to Avalon')}</button>
        </div>
        {message && <p role="status">{message}</p>}
        <p className={s.banner}>{t('Los cambios se guardan en tu proyecto privado de Avalon (con historial de versiones). Publicar no está conectado desde este editor.', 'Changes are saved to your private Avalon project (with version history). Publishing is not connected from this editor.')}</p>
        <WebsiteEditor pages={pages} onChange={onChange} lang={lang} />
      </div>
    </NovaSurface>
  );
}
