'use client';
import { useState } from 'react';
import { NovaSurface, ProjectLibrary, NovaDialog, FeedbackPanel, StatusBadge, type NovaLanguage } from '../nova';
import type { BuilderKind, BuilderHandoff, Project } from './contracts';
import { copy, createDraft, projectReducer, templates, validateDraft, type BuilderAction } from './model';
import { WebsiteEditor } from './website-editor';
import { ChatbotEditor } from './chatbot-editor';
import { CrmEditor } from './crm-editor';
import s from './builders.module.css';
export type ProductBuilderProps={kind:BuilderKind;lang:NovaLanguage;initialProjects?:readonly Project[];loading?:boolean;error?:string;onRetry?:()=>void;onHandoff?:BuilderHandoff};
/** Mount inside an already authorized route. All editing and versions are memory-only. */
export function ProductBuilder({kind,lang,initialProjects=[],loading=false,error,onRetry,onHandoff}:ProductBuilderProps){
 const [projects,setProjects]=useState<Project[]>(()=>copy(initialProjects.filter(p=>p.draft.content.kind===kind)));
 const [selected,setSelected]=useState<string|null>(null);const [history,setHistory]=useState(false);const [message,setMessage]=useState('');
 const t=(es:string,en:string)=>lang==='es'?es:en;const title={website:'Website Designer',chatbot:'AI Chatbots Builder',crm:'CRM Creator'}[kind];
 const current=projects.find(p=>p.draft.id===selected);const content=current?.draft.content;
 const dispatch=(action:BuilderAction)=>{setProjects(old=>old.map(p=>p.draft.id===selected?projectReducer(p,action):p));setMessage('');};
 const save=()=>{if(!current)return;const result=validateDraft(current.draft);if(!result.ok){setMessage(t('Revisa estos campos: ','Review these fields: ')+result.errors.join(', '));return;}dispatch({type:'save',id:crypto.randomUUID(),at:new Date().toISOString()});setMessage(t('Versión guardada solo en memoria. Se pierde al recargar.','Version saved in memory only. Reloading discards it.'));};
 return <NovaSurface label={title}><div className={s.builder}><h1>{title}</h1><p className={s.banner}>{t('Edición local · Persistencia y publicación no conectadas · Los borradores se pierden al recargar.','Local editing · Persistence and publishing not connected · Drafts are lost on reload.')}</p><StatusBadge status="disconnected" lang={lang}/>
 {loading?<FeedbackPanel state="loading" lang={lang}/>:error?<FeedbackPanel state="error" title={error} onRetry={onRetry} lang={lang}/>:<><button onClick={()=>{const draft=createDraft(kind,crypto.randomUUID());setProjects(p=>[{draft,versions:[]},...p]);setSelected(draft.id);setMessage('');}}>{t('Crear borrador','Create draft')}</button><h2>{t('Biblioteca · Recientes de esta sesión','Library · Recent in this session')}</h2><ProjectLibrary lang={lang} projects={projects.map(p=>({id:p.draft.id,name:(p.draft.demo?'DEMO · ':'')+(p.draft.name||t('Sin nombre','Untitled')),status:p.draft.status==='draft'?'idle':'completed',progress:null}))} onSelect={p=>{setSelected(p.id);setMessage('');}}/>
 {current&&content&&<section aria-label={t('Constructor','Builder')}><h2>{current.draft.name||t('Nuevo borrador','New draft')}</h2>{current.draft.demo&&<p>DEMO</p>}<label>{t('Nombre del proyecto','Project name')}<input maxLength={120} required value={current.draft.name} onChange={e=>dispatch({type:'edit',name:e.target.value})}/></label><label>{t('Plantillas · Reemplazan el contenido local','Templates · Replace local content')}<select value="" onChange={e=>{const template=templates.find(x=>x.id===e.target.value);if(template)dispatch({type:'template',template});}}><option value="">{t('Seleccionar plantilla','Select template')}</option>{templates.filter(x=>x.content.kind===kind).map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
 <p role="status">{current.draft.status==='draft'?t('Cambios locales sin guardar','Unsaved local changes'):t('Snapshot local guardado · No publicado','Local snapshot saved · Not published')}</p>
 {content.kind==='website'&&<WebsiteEditor key={current.draft.id} pages={content.pages} lang={lang} onChange={pages=>dispatch({type:'edit',content:{kind:'website',pages}})}/>}
 {content.kind==='chatbot'&&<ChatbotEditor config={content.config} lang={lang} onChange={config=>dispatch({type:'edit',content:{kind:'chatbot',config}})}/>}
 {content.kind==='crm'&&<CrmEditor content={content} lang={lang} onChange={next=>dispatch({type:'edit',content:next})}/>}
 <div className={s.tools}><button onClick={save}>{t('Guardar versión local','Save local version')}</button><button onClick={()=>setHistory(true)}>{t('Historial de versiones','Version history')} ({current.versions.length})</button><button disabled title={t('Requiere integración de Claude','Requires Claude integration')}>{t('Publicar · No conectado','Publish · Not connected')}</button>{onHandoff&&<button onClick={()=>{if(!validateDraft(current.draft).ok){setMessage(t('Corrige el borrador antes de entregarlo.','Fix the draft before handoff.'));return;}try{onHandoff(copy(current.draft));setMessage(t('Callback de entrega invocado; guardado remoto no verificado.','Handoff callback invoked; remote save unverified.'));}catch{setMessage(t('Falló la entrega; el borrador local se conserva.','Handoff failed; local draft retained.'));}}}>{t('Entregar configuración','Handoff configuration')}</button>}</div>
 <NovaDialog open={history} onClose={()=>setHistory(false)} title={t('Versiones locales','Local versions')} lang={lang}>{current.versions.length?<ol>{current.versions.map((v,i)=><li key={v.id}><time dateTime={v.savedAt}>{v.savedAt}</time><p>{v.draft.name}</p><button onClick={()=>{dispatch({type:'restore',id:v.id});setHistory(false);}}>{t('Restaurar','Restore')} {current.versions.length-i}</button></li>)}</ol>:<FeedbackPanel state="empty" lang={lang}/>}</NovaDialog></section>}
 {message&&<p role="status">{message}</p>}</>}
 </div></NovaSurface>;
}
export function WebsiteDesignerUI(props:Omit<ProductBuilderProps,'kind'>){return <ProductBuilder {...props} kind="website"/>;}
export function ChatbotsBuilderUI(props:Omit<ProductBuilderProps,'kind'>){return <ProductBuilder {...props} kind="chatbot"/>;}
export function CrmCreatorUI(props:Omit<ProductBuilderProps,'kind'>){return <ProductBuilder {...props} kind="crm"/>;}
