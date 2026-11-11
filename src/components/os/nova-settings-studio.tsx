'use client';
// Persistence shell around Codex's Nova CrmEditor / ChatbotEditor (both unchanged). Saves to the project's settings
// through an owner-only server action with optimistic version control; save states and a leave warning.
import { useEffect, useRef, useState, useTransition } from 'react';
import { NovaSurface, StatusBadge, type NovaLanguage, type NovaStatus } from '@/components/avalon-ui/nova';
import { CrmEditor } from '@/components/avalon-ui/builders/crm-editor';
import { ChatbotEditor } from '@/components/avalon-ui/builders/chatbot-editor';
import type { BuilderContent, ChatbotConfig } from '@/components/avalon-ui/builders/contracts';
import s from '@/components/avalon-ui/builders/builders.module.css';
import { saveNovaStudio } from '@/app/admin/workspace/nova-studio-actions';

type CrmContent = Extract<BuilderContent, { kind: 'crm' }>;
type Props =
  | { kind: 'crm'; projectId: string; projectName: string; version: number; initial: CrmContent; lang: NovaLanguage }
  | { kind: 'chatbot'; projectId: string; projectName: string; version: number; initial: ChatbotConfig; lang: NovaLanguage };
type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
const BADGE: Record<SaveState, NovaStatus> = { saved: 'completed', dirty: 'idle', saving: 'running', error: 'failed', conflict: 'blocked' };

export function NovaSettingsStudio(props: Props) {
  const { kind, projectId, projectName, lang } = props;
  const t = (es: string, en: string) => (lang === 'es' ? es : en);
  const [content, setContent] = useState<CrmContent | ChatbotConfig>(props.initial);
  const stored = useRef({ version: props.version, print: JSON.stringify(props.initial) });
  const [state, setState] = useState<SaveState>('saved');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(content) !== stored.current.print;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (next: CrmContent | ChatbotConfig) => { setContent(next); setState('dirty'); setMessage(''); };
  const save = () => {
    if (!dirty) return;
    const snapshot = content;
    setState('saving'); setMessage('');
    startTransition(async () => {
      try {
        const r = await saveNovaStudio(kind, projectId, stored.current.version, snapshot);
        if (r.ok) {
          stored.current = { version: r.version, print: JSON.stringify(snapshot) };
          setState('saved'); setMessage(t('Guardado en Avalon. Puedes recargar: los cambios se recuperan.', 'Saved to Avalon. You can reload: changes are recovered.'));
        } else if (r.error === 'conflict') {
          setState('conflict'); setMessage(t('Otra sesión cambió este proyecto. Recarga para ver la última versión (copia antes lo que quieras conservar).', 'Another session changed this project. Reload to get the latest version (copy anything you want to keep first).'));
        } else {
          setState('error'); setMessage(t(`No se guardó (${r.error}). Revisa los campos marcados.`, `Not saved (${r.error}). Check the highlighted fields.`));
        }
      } catch {
        setState('error'); setMessage(t('No se pudo conectar con el servidor. Tus cambios siguen en pantalla; vuelve a intentarlo.', 'Could not reach the server. Your changes are still on screen; try again.'));
      }
    });
  };

  const shown: SaveState = pending ? 'saving' : state === 'saved' && dirty ? 'dirty' : state;
  const label = { saved: t('Guardado', 'Saved'), dirty: t('Cambios sin guardar', 'Unsaved changes'), saving: t('Guardando…', 'Saving…'), error: t('Error al guardar', 'Save failed'), conflict: t('Conflicto de versión', 'Version conflict') }[shown];
  const title = kind === 'crm' ? 'CRM Creator' : 'AI Chatbots Builder';

  return (
    <NovaSurface label={`${title} · ${projectName}`}>
      <div className={s.builder} data-save-state={shown}>
        <div className={s.tools}>
          <StatusBadge status={BADGE[shown]} lang={lang} />
          <strong role="status" aria-live="polite" data-testid="save-state">{label}</strong>
          <button type="button" onClick={save} disabled={pending || !dirty} data-testid="studio-save">{t('Guardar en Avalon', 'Save to Avalon')}</button>
        </div>
        {message && <p role="status">{message}</p>}
        <p className={s.banner}>{kind === 'crm'
          ? t('El diseño del CRM se guarda en tu proyecto privado (el mismo blueprint que exporta CRM Creator). No crea tablas ni cambia permisos reales.', 'The CRM design is saved to your private project (the same blueprint CRM Creator exports). It does not create tables or change real permissions.')
          : t('La configuración del chatbot se guarda en tu proyecto privado de AI Receptionist. Las respuestas con IA no están conectadas.', 'The chatbot configuration is saved to your private AI Receptionist project. AI replies are not connected.')}</p>
        {props.kind === 'crm'
          ? <CrmEditor content={content as CrmContent} onChange={change} lang={lang} />
          : <ChatbotEditor config={content as ChatbotConfig} onChange={change} lang={lang} />}
      </div>
    </NovaSurface>
  );
}
