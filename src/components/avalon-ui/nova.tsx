'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import s from './nova.module.css';

export type NovaLanguage = 'es' | 'en';
export type NovaStatus = 'idle' | 'running' | 'completed' | 'failed' | 'blocked' | 'stale' | 'disconnected';
const words = {
  es: { idle:'Sin ejecutar', running:'En ejecución', completed:'Completado', failed:'Fallido', blocked:'Bloqueado', stale:'Desactualizado', disconnected:'No conectado', unknown:'No medido', search:'Buscar proyectos', filter:'Estado', all:'Todos', empty:'No hay resultados', retry:'Reintentar', loading:'Cargando', close:'Cerrar', progress:'Progreso', evidence:'Evidencia', unavailable:'Sin evidencia verificable' },
  en: { idle:'Not started', running:'Running', completed:'Completed', failed:'Failed', blocked:'Blocked', stale:'Stale', disconnected:'Not connected', unknown:'Not measured', search:'Search projects', filter:'Status', all:'All', empty:'No results', retry:'Retry', loading:'Loading', close:'Close', progress:'Progress', evidence:'Evidence', unavailable:'No verifiable evidence' },
};

/** Presentation only: callers retain authorization, data fetching and persistence. */
export function NovaSurface({ children, label }: { children:ReactNode; label:string }) {
  return <section className={s.surface} aria-label={label}>{children}</section>;
}
export function StatusBadge({ status, lang }: { status:NovaStatus; lang:NovaLanguage }) {
  return <span className={s.badge} data-state={status}>{words[lang][status]}</span>;
}
export function MetricCard({ label, value, detail, lang }: { label:string; value:string | number | null; detail?:string; lang:NovaLanguage }) {
  return <article className={s.card}><h3>{label}</h3><p className={s.metric}>{value ?? words[lang].unknown}</p>{detail && <p>{detail}</p>}</article>;
}
export function ProgressMeter({ label, value, lang }: { label:string; value:number | null; lang:NovaLanguage }) {
  const amount = value !== null && Number.isFinite(value) ? Math.min(100, Math.max(0,value)) : null;
  return <div className={s.progress}><span>{label}: {amount === null ? words[lang].unknown : `${amount}%`}</span>{amount !== null && <progress aria-label={label} value={amount} max={100}/>}</div>;
}
/** Only same-origin relative paths or HTTPS evidence links are rendered. */
export function safeNovaHref(href:string):string | null {
  if (/^\/(?!\/)[^\\\s]*$/.test(href)) return href;
  try { const url = new URL(href); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function EvidenceLink({ href, label, lang }: { href?:string; label:string; lang:NovaLanguage }) {
  const safe = href && safeNovaHref(href);
  return safe ? <a className={s.link} href={safe} rel="noopener noreferrer">{label}</a> : <span className={s.muted}>{words[lang].unavailable}</span>;
}
export function FeedbackPanel({ state, title, detail, onRetry, lang }: { state:'empty'|'loading'|'error'|'permission'; title?:string; detail?:string; onRetry?:()=>void; lang:NovaLanguage }) {
  return <div className={s.feedback} role={state === 'error' ? 'alert' : 'status'} aria-busy={state === 'loading'}>
    {state === 'loading' && <span className={s.skeleton} aria-hidden="true"/>}
    <h3>{title ?? (state === 'loading' ? words[lang].loading : words[lang].empty)}</h3>{detail && <p>{detail}</p>}
    {state === 'error' && onRetry && <button className={s.button} onClick={onRetry}>{words[lang].retry}</button>}
  </div>;
}
export type NovaProject = { id:string; name:string; client?:string; owner?:string; status:NovaStatus; href?:string; progress:number | null; evidence?:{label:string;href:string} };
export function ProjectLibrary({ projects, lang, onSelect }: { projects:readonly NovaProject[]; lang:NovaLanguage; onSelect?:(project:NovaProject)=>void }) {
  const [query,setQuery] = useState(''); const [filter,setFilter] = useState('all'); const id = useId(); const w=words[lang];
  const rows=projects.filter(p=>(filter === 'all' || p.status === filter) && `${p.name} ${p.client ?? ''} ${p.owner ?? ''}`.toLocaleLowerCase(lang).includes(query.toLocaleLowerCase(lang)));
  return <div><div className={s.toolbar}><label htmlFor={`${id}-q`}>{w.search}<input id={`${id}-q`} type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label htmlFor={`${id}-f`}>{w.filter}<select id={`${id}-f`} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">{w.all}</option>{(['idle','running','completed','failed','blocked','stale','disconnected'] as const).map(status=><option key={status} value={status}>{w[status]}</option>)}</select></label></div>
    <p role="status" className={s.muted}>{rows.length} / {projects.length}</p>
    {rows.length ? <ul className={s.grid}>{rows.map(p=><li className={s.card} key={p.id}><StatusBadge status={p.status} lang={lang}/><h3>{p.name}</h3>{p.client && <p>{p.client}</p>}{p.owner && <p>{p.owner}</p>}<ProgressMeter label={w.progress} value={p.progress} lang={lang}/>{onSelect ? <button className={s.button} onClick={()=>onSelect(p)}>{p.name}</button> : p.href && <EvidenceLink href={p.href} label={p.name} lang={lang}/>}{p.evidence && <EvidenceLink {...p.evidence} lang={lang}/>}</li>)}</ul> : <FeedbackPanel state="empty" lang={lang}/>}
  </div>;
}
export function NovaDialog({ open, onClose, title, children, lang }: { open:boolean; onClose:()=>void; title:string; children:ReactNode; lang:NovaLanguage }) {
  const ref=useRef<HTMLDialogElement>(null); const titleId=useId();
  useEffect(()=>{const dialog=ref.current; if (!dialog) return; if(open && !dialog.open) dialog.showModal(); if(!open && dialog.open) dialog.close();},[open]);
  return <dialog className={s.dialog} ref={ref} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClose={onClose}>
    <div className={s.surface}><header className={s.dialogHeader}><h2 id={titleId}>{title}</h2><button className={s.button} onClick={onClose} autoFocus>{words[lang].close}</button></header>{children}</div>
  </dialog>;
}
export type NovaActivity = { id:string; title:string; timestamp:string; status:NovaStatus; detail?:string; evidence?:{href:string;label:string} };
export function ActivityTimeline({ items, lang }: { items:readonly NovaActivity[]; lang:NovaLanguage }) {
  return items.length ? <ol className={s.timeline}>{items.map(item=><li key={item.id}><StatusBadge status={item.status} lang={lang}/><h3>{item.title}</h3><time dateTime={item.timestamp}>{item.timestamp}</time>{item.detail && <p>{item.detail}</p>}{item.evidence && <EvidenceLink {...item.evidence} lang={lang}/>}</li>)}</ol> : <FeedbackPanel state="empty" lang={lang}/>;
}
