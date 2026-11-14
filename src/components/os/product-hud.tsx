import Link from 'next/link';
import { pick, formatDate, type Lang } from '@/lib/i18n';
import { SERVICES, clientId, latestChecks, nextStates, readProductState, safeLink, ISSUE_KINDS, ISSUE_SEVERITIES, filterRequests, STATES, type CompanyRecord, type RequestState } from '@/lib/os/client-hud';
import type { ProjectRow, AuditRow, Loaded } from '@/lib/os/data';
import type { ProductMetric } from '@/lib/os/client-hud-data';
import { saveProductOperation } from '@/app/admin/workspace/products/actions';
import { DbNotice, Flash, statusLabel } from './ui';
import type { ReactNode } from 'react';
import s from './client-hud.module.css';

const STATUS: Record<RequestState,[string,string]> = {
  requested:['Solicitado','Requested'], approved:['Aprobado','Approved'],
  in_progress:['En progreso','In progress'], review:['En revisión','In review'],
  blocked:['Bloqueado','Blocked'], fixed:['Corregido','Fixed'],
  verified:['Verificado manualmente','Manually verified'], closed:['Cerrado','Closed'],
  done:['Completado (histórico)','Completed (legacy)'], cancelled:['Cancelado','Cancelled'],
};
const RESULT: Record<'passed'|'failed'|'blocked',[string,string]> = { passed:['Aprobada','Passed'], failed:['Fallida','Failed'], blocked:['Bloqueada','Blocked'] };
function validLink(value:unknown) {try{return safeLink(value);}catch{return '';}}
function Fields({project,operation}:{project:ProjectRow;operation:string}) {
  return <><input type="hidden" name="id" value={project.id}/><input type="hidden" name="version" value={project.version}/><input type="hidden" name="operation" value={operation}/></>;
}
export function ProductHud({lang,project,company,metrics,audit,ok,error,context,owners=[],requestFilters={}}:{lang:Lang;project:ProjectRow;company:CompanyRecord|null;metrics:ProductMetric[];audit:Loaded<AuditRow[]>;ok?:string;error?:string;context?:ReactNode;owners?:{user_id:string;email:string}[];requestFilters?:Record<string,string|string[]|undefined>}) {
  let valid = true;
  let state;
  try { state = readProductState(project.settings.client_hud); } catch { valid=false; state=readProductState(undefined); }
  const disabled=!valid||project.status==='archived';
  const service=SERVICES[project.module];
  const editor=`/admin/workspace/${service.slug}/${project.id}`;
  const cid=clientId(project.settings);
  const confirmedClient=project.client_id;
  const productControl=project.settings.product_control;
  const productMeta=productControl && typeof productControl==='object' && !Array.isArray(productControl)
    ? productControl as Record<string,unknown> : {};
  const sourceTool=typeof productMeta.source_tool==='string' ? productMeta.source_tool.slice(0,40) : '—';
  const value=project.settings.operations;
  const op=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const liveUrl=validLink(op.url), repository=validLink(op.repository);
  const creativeRaw = project.settings.creative;
  const creative = creativeRaw && typeof creativeRaw === "object" && !Array.isArray(creativeRaw)
    ? creativeRaw as Record<string, unknown> : null;
  const generatedWithHiggsfield = creative?.provider === "higgsfield";
  const higgsfieldRef = typeof creative?.external_ref === "string" ? creative.external_ref.slice(0, 120) : "";
  const latest=latestChecks(state.checks);
  const pending=state.requests.filter(r=>!['done','closed','cancelled'].includes(r.status));
  const urgent=pending.filter(r=>r.priority==='urgent');
  const failures=latest.filter(c=>c.result==='failed');
  const names=(key:string)=>service.labels[service.checks.findIndex(c=>c===key)]||key;
  const namesEn=(key:string)=>service.labelsEn[service.checks.findIndex(c=>c===key)]||key;
  const filtered=filterRequests(state.requests,requestFilters);
  const requests=[...filtered.requests].sort((a,b)=>Number(b.priority==='urgent')-Number(a.priority==='urgent')||b.created_at.localeCompare(a.created_at));
  return <main className={s.hud} data-service={project.module}>
    <header className={s.header}><div><p className={s.eyebrow}>{service.name} / {company?.company||(cid?'CRM '+cid.slice(0,8):pick(lang,'Sin empresa vinculada','No linked company'))}</p><h1>{project.name}</h1><p className={s.description}>{project.description||pick(lang,'Completa la descripci\u00f3n desde el editor del producto.','Add a description in the product editor.')}</p><span className={s.tag}>{statusLabel(lang,project.status)}</span></div><div className={s.actions}>{(cid||confirmedClient)&&<Link className={s.button}
      href={confirmedClient?`/admin/workspace/crm/clients/${confirmedClient}`:`/admin/workspace/clients/${cid}?tool=${project.module}`}>
      {pick(lang,'Empresa en CRM','Company in CRM')}</Link>}{liveUrl && <a className={`${s.button} ${s.primary}`} href={liveUrl} target="_blank" rel="noopener noreferrer">{pick(lang,'Abrir producto externo','Open external product')}</a>}<Link className={s.button} href={`/admin/workspace/library/${project.id}`}>{pick(lang,'Versiones y archivos','Versions and files')}</Link><Link className={s.button} href={`/admin/workspace/${service.slug}`}>{pick(lang,'Todos los proyectos','All projects')}</Link></div></header>
    <Flash lang={lang} ok={ok} error={error}/>
    {!valid&&<p role="alert" className={s.notice}>{pick(lang,'Los datos operativos guardados necesitan revisi\u00f3n. La edici\u00f3n est\u00e1 bloqueada para no sobrescribirlos.','Saved operations data needs review. Editing is blocked to prevent overwriting it.')}</p>}
    {project.status==='archived'&&<p className={s.notice}>{pick(lang,'Proyecto archivado: consulta disponible, cambios bloqueados.','Archived project: read-only, changes disabled.')}</p>}
    {context}
    <nav className={s.tabs} aria-label={pick(lang,'Secciones del producto','Product sections')}>{[['overview','Resumen','Overview'],['monitor','Monitoreo','Monitoring'],['checks','Pruebas','Tests'],['requests','Errores y mejoras','Issues and improvements'],['resources','Conexiones y archivos','Connections and files'],['history','Historial','History']].map(([id,es,en])=><a className={s.button} key={id} href={`#${id}`}>{pick(lang,es,en)}</a>)}</nav>
    <div className={s.stats}>{metrics.map(m=><div className={s.stat} key={m.en}>{pick(lang,m.es,m.en)}<strong>{m.value??'\u2014'}</strong></div>)}<div className={s.stat}>{pick(lang,'Solicitudes abiertas','Open requests')}<strong>{valid?pending.length:'\u2014'}</strong></div><div className={s.stat}>{pick(lang,'Pruebas manuales fallidas','Failed manual checks')}<strong>{valid?failures.length:'\u2014'}</strong></div></div>
    <p className={s.muted}>{pick(lang,'Las cifras reflejan registros de Avalon. No son ventas cobradas, visitas web, uptime ni actividad en vivo de proveedores. Un guion significa que el dato no pudo verificarse.','Figures reflect Avalon records, not collected revenue, website visits, uptime or live provider activity. A dash means the data could not be verified.')}</p>
    <section id="overview" className={s.panel}><h2>{pick(lang,'Ficha del producto registrado','Registered product record')}</h2><dl className={s.detail}><dt>{pick(lang,'Empresa','Company')}</dt><dd>{company?.company||pick(lang,'Vinculaci\u00f3n pendiente de verificaci\u00f3n','Link pending verification')}</dd><dt>{pick(lang,'Responsable','Responsible')}</dt><dd>{typeof op.responsible==='string'&&op.responsible||'\u2014'}</dd>
        <dt>{pick(lang,'Creado por','Created by')}</dt><dd>{sourceTool}</dd>
        <dt>{pick(lang,'Modo de registro','Registration mode')}</dt>
        <dd>{productMeta.mode==='external_reference'?pick(lang,'Referencia externa, sin archivos garantizados','External reference, files not guaranteed'):
          productMeta.mode==='pending_delivery'?pick(lang,'Entrega pendiente','Pending delivery'):pick(lang,'Origen por revisar','Source not verified')}</dd><dt>{pick(lang,'Versi\u00f3n de ficha','Record version')}</dt><dd>{project.version}</dd><dt>{pick(lang,'Actualizado','Updated')}</dt><dd>{formatDate(lang,project.updated_at,true)}</dd><dt>{pick(lang,'Referencia de proyecto','Project reference')}</dt><dd>{project.id}</dd>{generatedWithHiggsfield&&<><dt>{pick(lang,'Origen creativo','Creative source')}</dt><dd>Higgsfield · {higgsfieldRef} · {pick(lang,'Referencia registrada; publicación no verificada','Reference registered; publication not verified')}</dd></>}</dl>
      <details className={s.row} open><summary>{pick(lang,'Objetivos, alcance y entregables','Objectives, scope and deliverables')}</summary><form action={saveProductOperation} className={s.form}><Fields project={project} operation="brief"/>{[['objective','Objetivo del cliente','Client objective'],['scope','Alcance contratado','Contracted scope'],['deliverables','Entregables y enlaces de referencia (sin claves)','Deliverables and reference links (no keys)'],['acceptance','Criterios para aprobar la entrega','Delivery acceptance criteria']].map(([key,es,en])=><label className={s.field} key={key}>{pick(lang,es,en)}<textarea name={key} defaultValue={state.brief[key as keyof typeof state.brief]} maxLength={2000} rows={3} disabled={disabled}/></label>)}<label className={s.field}>{pick(lang,'Fecha objetivo','Target date')}<input name="deadline" type="date" defaultValue={state.brief.deadline} disabled={disabled}/></label><button className={s.button} disabled={disabled}>{pick(lang,'Guardar ficha','Save record')}</button></form></details>
    </section>
    <section id="monitor" className={s.panel}><h2>{pick(lang,'Monitoreo y atenci\u00f3n','Monitoring and attention')}</h2><div className={s.columns}><div><h3>{pick(lang,'Urgente','Urgent')}</h3>{urgent.length||failures.length?<ul className={s.list}>{urgent.map(r=><li key={r.id}><a href="#requests">{r.title}</a></li>)}{failures.map(c=><li key={c.id}><a href="#checks">{pick(lang,names(c.check),namesEn(c.check))}</a> <span className={s.tag} data-tone="failed">{pick(lang,'Fallo registrado manualmente','Manually recorded failure')}</span></li>)}</ul>:<p className={s.muted}>{pick(lang,'Sin alertas urgentes en los registros disponibles.','No urgent alerts in the available records.')}</p>}</div><div><h3>{pick(lang,'Disponibilidad y rendimiento externos','External availability and performance')}</h3><p className={s.notice}>{pick(lang,'No conectado. Registrar una URL no activa monitoreo continuo ni confirma que el servicio est\u00e9 disponible.','Not connected. Saving a URL does not enable continuous monitoring or confirm service availability.')}</p>{liveUrl&&<a className={s.button} href={liveUrl} target="_blank" rel="noopener noreferrer">{pick(lang,'Abrir producto para revisarlo','Open product for review')}</a>}</div></div></section>
    <section id="checks" className={s.panel}><h2>{pick(lang,'Centro de pruebas','Testing center')}</h2><p className={s.muted}>{pick(lang,'Registra una comprobaci\u00f3n que hayas realizado. Este formulario no ejecuta pruebas autom\u00e1ticas ni genera pedidos o pagos. Usa entornos de prueba.','Record a check you performed. This form does not run automated tests or create orders or payments. Use test environments.')}</p><div className={s.grid}>{service.checks.map((key,i)=>{const check=latest.find(c=>c.check===key);return <div className={s.stat} key={key}><h3>{pick(lang,service.labels[i],service.labelsEn[i])}</h3>{check?<><span className={s.tag} data-tone={check.result}>{pick(lang,...RESULT[check.result])}</span><p className={s.muted}>{formatDate(lang,check.created_at,true)}</p></>:<span className={s.tag}>{pick(lang,'Sin verificar','Not verified')}</span>}</div>;})}</div>
      <details className={s.row}><summary>{pick(lang,'Registrar resultado de prueba','Record test result')}</summary><form action={saveProductOperation} className={s.form}><Fields project={project} operation="check"/><label className={s.field}>{pick(lang,'Prueba','Test')}<select name="check" disabled={disabled}>{service.checks.map((key,i)=><option value={key} key={key}>{pick(lang,service.labels[i],service.labelsEn[i])}</option>)}</select></label><label className={s.field}>{pick(lang,'Resultado','Result')}<select name="result" disabled={disabled}>{Object.entries(RESULT).map(([key,value])=><option key={key} value={key}>{pick(lang,...value)}</option>)}</select></label><label className={s.field}>{pick(lang,'Qu\u00e9 comprobaste y qu\u00e9 sucedi\u00f3','What you checked and what happened')}<textarea name="notes" maxLength={2000} required rows={3} disabled={disabled}/></label><label className={s.field}>{pick(lang,'Enlace HTTPS a evidencia (opcional)','HTTPS evidence link (optional)')}<input type="url" name="evidence" maxLength={500} disabled={disabled}/></label><button className={s.button} disabled={disabled||state.checks.length>=200}>{pick(lang,'Guardar resultado manual','Save manual result')}</button></form></details>
      <details className={s.row}><summary>{pick(lang,'Historial de pruebas manuales','Manual test history')} ({state.checks.length})</summary><ul className={s.list}>{[...state.checks].reverse().slice(0,20).map(c=><li className={s.row} key={c.id}><h3>{pick(lang,names(c.check),namesEn(c.check))}</h3><span className={s.tag} data-tone={c.result}>{pick(lang,...RESULT[c.result])}</span><p className={s.description}>{c.notes}</p><p className={s.muted}>{formatDate(lang,c.created_at,true)} / {c.created_by}</p>{c.evidence&&<a href={c.evidence} target="_blank" rel="noopener noreferrer">{pick(lang,'Ver evidencia','View evidence')}</a>}</li>)}</ul><p className={s.muted}>{pick(lang,'Se muestran los 20 registros m\u00e1s recientes.','Showing the 20 most recent records.')}</p></details>
    </section>
    <section id="requests" className={s.panel}>
      <h2>{pick(lang,'Errores y mejoras','Issues and improvements')}</h2>
      <p className={s.muted}>{pick(lang,
        'Registra cada problema o cambio del producto externo. Estas acciones no arrancan agentes ni despliegan código.',
        'Track every issue or change for the external product. These actions do not launch agents or deploy code.')}</p>
      <details className={s.row}><summary>{pick(lang,'Nueva incidencia o mejora','New issue or improvement')}</summary>
        <form action={saveProductOperation} className={s.form}><Fields project={project} operation="request"/>
          <label className={s.field}>{pick(lang,'Título','Title')}<input name="title" maxLength={120} required disabled={disabled}/></label>
          <label className={s.field}>{pick(lang,'Descripción','Description')}<textarea name="details" maxLength={4000} rows={3} required disabled={disabled}/></label>
          <label className={s.field}>{pick(lang,'Tipo','Type')}
            <select name="kind" disabled={disabled}>{ISSUE_KINDS.map(kind=><option key={kind} value={kind}>{kind.replaceAll('_',' ')}</option>)}</select>
          </label>
          <label className={s.field}>{pick(lang,'Prioridad','Priority')}
            <select name="severity" defaultValue="P2" disabled={disabled}>{ISSUE_SEVERITIES.map(level=><option key={level} value={level}>{level}</option>)}</select>
          </label>
          <label className={s.field}>{pick(lang,'Responsable','Assignee')}
            <select name="assignee_id" defaultValue="" disabled={disabled}><option value="">{pick(lang,'Sin asignar','Unassigned')}</option>
              {owners.map(owner=><option key={owner.user_id} value={owner.user_id}>{owner.email}</option>)}
            </select>
          </label>
          <label className={s.field}>{pick(lang,'Resultado esperado','Expected result')}
            <textarea name="expected" maxLength={2000} rows={2} disabled={disabled}/></label>
          <label className={s.field}>{pick(lang,'Resultado actual','Actual result')}
            <textarea name="actual" maxLength={2000} rows={2} disabled={disabled}/></label>
          <label className={s.field}>{pick(lang,'Pasos para reproducir','Reproduction steps')}
            <textarea name="reproduction" maxLength={2000} rows={2} disabled={disabled}/></label>
          <label className={s.field}>{pick(lang,'URL HTTPS de evidencia (opcional)','HTTPS evidence URL (optional)')}
            <input name="evidence" type="url" maxLength={500} disabled={disabled}/></label>
          <label className={s.field}>{pick(lang,'Checklist inicial (una tarea por línea, máximo 15)','Initial checklist (one per line, max 15)')}
            <textarea name="checklist" maxLength={1600} rows={3} disabled={disabled}/></label>
          <button className={`${s.button} ${s.primary}`} disabled={disabled||state.requests.length>=100}>{pick(lang,'Guardar incidencia','Save issue')}</button>
        </form>
      </details>
      <form action={`/admin/workspace/products/${project.id}#requests`} className={s.toolbar}>
        <label className={s.field}>{pick(lang,'Buscar incidencia','Search issues')}<input name="issue_q" defaultValue={filtered.q} maxLength={120}/></label>
        <label className={s.field}>{pick(lang,'Estado de incidencia','Issue state')}<select name="issue_state" defaultValue={filtered.status}><option value="">{pick(lang,'Todos','All')}</option>{STATES.map(st=><option key={st} value={st}>{pick(lang,...STATUS[st])}</option>)}</select></label>
        <label className={s.field}>{pick(lang,'Prioridad','Priority')}<select name="issue_severity" defaultValue={filtered.severity}><option value="">{pick(lang,'Todas','All')}</option>{ISSUE_SEVERITIES.map(v=><option key={v}>{v}</option>)}</select></label>
        <label className={s.field}>{pick(lang,'Responsable','Assignee')}<select name="issue_assignee" defaultValue={filtered.assignee}><option value="">{pick(lang,'Todos','All')}</option><option value="unassigned">{pick(lang,'Sin asignar','Unassigned')}</option>{owners.map(o=><option key={o.user_id} value={o.user_id}>{o.email}</option>)}</select></label>
        <button className={s.button}>{pick(lang,'Filtrar incidencias','Filter issues')}</button>
        <p role="status">{requests.length} / {state.requests.length} {pick(lang,'incidencias registradas','recorded issues')}</p>
      </form>
      <ul className={s.list}>{requests.map(r=><li className={s.row} key={r.id}>
        <h3>{r.title}</h3>
        <div className={s.actions}>
          <span className={s.tag} data-tone={r.priority}>{r.severity ?? (r.priority==='urgent'?'P1':'P2')}</span>
          <span className={s.tag}>{r.kind ?? 'improvement'}</span>
          <span className={s.tag}>{pick(lang,...STATUS[r.status])}</span>
        </div>
        <p className={s.description}>{r.details}</p>
        {r.assignee_id&&<p className={s.muted}>{pick(lang,'Responsable','Assignee')}: {owners.find(o=>o.user_id===r.assignee_id)?.email ?? r.assignee_id}</p>}
        {r.expected&&<p className={s.description}><strong>{pick(lang,'Esperado','Expected')}: </strong>{r.expected}</p>}
        {r.actual&&<p className={s.description}><strong>{pick(lang,'Actual','Actual')}: </strong>{r.actual}</p>}
        {r.reproduction&&<p className={s.description}><strong>{pick(lang,'Reproducir','Reproduce')}: </strong>{r.reproduction}</p>}
        {r.evidence&&<a href={r.evidence} target="_blank" rel="noopener noreferrer">{pick(lang,'Ver evidencia externa','View external evidence')}</a>}
        <p className={s.muted}>{formatDate(lang,r.updated_at,true)} / {r.updated_by}</p>
        <div className={s.actions}>
          {nextStates(r.status).length>0&&<form action={saveProductOperation} className={s.actions}>
            <Fields project={project} operation="status"/><input type="hidden" name="request_id" value={r.id}/>
            <label className={s.field}>{pick(lang,'Siguiente estado','Next state')}
              <select name="status" disabled={disabled}>{nextStates(r.status).map(st=><option value={st} key={st}>{pick(lang,...STATUS[st])}</option>)}</select></label>
            {nextStates(r.status).includes('verified') && <label className={s.field}>
              {pick(lang,'Prueba manual de la corrección (obligatoria para Verificado)','Manual verification evidence (required for Verified)')}
              <textarea name="verification_notes" maxLength={1000} rows={2} disabled={disabled}
                placeholder={pick(lang,'Qué se probó, con qué dispositivo y cuál fue el resultado','What was tested, on which device and what was the result')}/>
            </label>}
            <button className={s.button} disabled={disabled}>{pick(lang,'Actualizar','Update')}</button>
          </form>}
          {['done','closed','cancelled'].includes(r.status)&&<form action={saveProductOperation}>
            <Fields project={project} operation="reopen"/><input type="hidden" name="request_id" value={r.id}/>
            <button className={s.button} disabled={disabled}>{pick(lang,'Reabrir','Reopen')}</button>
          </form>}
          <a className={s.button} href={`/admin/workspace/products/${project.id}/brief?request=${r.id}`}>{pick(lang,'Descargar encargo para IA','Download AI work brief')}</a>
        </div>
        {!['verified','closed'].includes(r.status)&&<details><summary>{pick(lang,'Editar incidencia','Edit issue')}</summary>
          <form action={saveProductOperation} className={s.form}>
            <Fields project={project} operation="request_edit"/><input type="hidden" name="request_id" value={r.id}/>
            <label className={s.field}>{pick(lang,'Título','Title')}<input name="title" required maxLength={120} defaultValue={r.title} disabled={disabled}/></label>
            <label className={s.field}>{pick(lang,'Descripción','Description')}<textarea name="details" required maxLength={4000} rows={3} defaultValue={r.details} disabled={disabled}/></label>
            <label className={s.field}>{pick(lang,'Tipo','Type')}<select name="kind" defaultValue={r.kind ?? 'improvement'} disabled={disabled}>
              {ISSUE_KINDS.map(kind=><option key={kind} value={kind}>{kind.replaceAll('_',' ')}</option>)}</select></label>
            <label className={s.field}>{pick(lang,'Prioridad','Priority')}<select name="severity" defaultValue={r.severity ?? (r.priority==='urgent'?'P1':'P2')} disabled={disabled}>
              {ISSUE_SEVERITIES.map(level=><option key={level} value={level}>{level}</option>)}</select></label>
            <label className={s.field}>{pick(lang,'Responsable','Assignee')}<select name="assignee_id" defaultValue={r.assignee_id ?? ''} disabled={disabled}>
              <option value="">{pick(lang,'Sin asignar','Unassigned')}</option>
              {owners.map(owner=><option key={owner.user_id} value={owner.user_id}>{owner.email}</option>)}</select></label>
            <label className={s.field}>{pick(lang,'Resultado esperado','Expected result')}<textarea name="expected" maxLength={2000} defaultValue={r.expected ?? ''} disabled={disabled}/></label>
            <label className={s.field}>{pick(lang,'Resultado actual','Actual result')}<textarea name="actual" maxLength={2000} defaultValue={r.actual ?? ''} disabled={disabled}/></label>
            <label className={s.field}>{pick(lang,'Pasos para reproducir','Reproduction steps')}<textarea name="reproduction" maxLength={2000} defaultValue={r.reproduction ?? ''} disabled={disabled}/></label>
            <label className={s.field}>{pick(lang,'URL de evidencia','Evidence URL')}<input name="evidence" type="url" maxLength={500} defaultValue={r.evidence ?? ''} disabled={disabled}/></label>
            <button className={s.button} disabled={disabled}>{pick(lang,'Guardar cambios','Save changes')}</button>
          </form>
        </details>}
        <details><summary>{pick(lang,'Checklist y comentarios','Checklist and notes')}</summary>
          <ul className={s.list}>{(r.items ?? []).map(item=><li key={item.id}>
            <form action={saveProductOperation} className={s.actions}>
              <Fields project={project} operation="request_item_status"/>
              <input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="item_id" value={item.id}/>
              <input type="hidden" name="done" value={String(!item.done)}/>
              <button className={s.button} disabled={disabled||['verified','closed'].includes(r.status)}>{item.done?'☑':'☐'} {item.text}</button>
            </form>
          </li>)}</ul>
          <form action={saveProductOperation} className={s.actions}>
            <Fields project={project} operation="request_add_item"/><input type="hidden" name="request_id" value={r.id}/>
            <label className={s.field}>{pick(lang,'Agregar punto','Add checklist item')}<input name="item" maxLength={240} required disabled={disabled||['verified','closed'].includes(r.status)}/></label>
            <button className={s.button} disabled={disabled||['verified','closed'].includes(r.status)||(r.items?.length ?? 0)>=15}>{pick(lang,'Agregar','Add')}</button>
          </form>
          <ul className={s.list}>{(r.notes ?? []).map(note=><li className={s.row} key={note.id}>
            <p>{note.body}</p><p className={s.muted}>{formatDate(lang,note.created_at,true)} / {owners.find(o=>o.user_id===note.author)?.email ?? note.author}</p>
          </li>)}</ul>
          <form action={saveProductOperation} className={s.form}>
            <Fields project={project} operation="request_note"/><input type="hidden" name="request_id" value={r.id}/>
            <label className={s.field}>{pick(lang,'Nueva nota de mantenimiento','New maintenance note')}
              <textarea name="body" maxLength={1000} rows={2} required disabled={disabled}/></label>
            <button className={s.button} disabled={disabled||(r.notes?.length ?? 0)>=40}>{pick(lang,'Guardar nota','Save note')}</button>
          </form>
        </details>
      </li>)}</ul>
      {!requests.length&&<p className={s.empty}>{pick(lang,'Sin incidencias registradas.','No issues recorded.')}</p>}
      <p className={s.muted}>{pick(lang,
        'Estas incidencias son internas. Los reportes para IA requieren revisión y no contienen credenciales ni conceden acceso.',
        'These issues are internal. AI work briefs require review and do not grant credentials or access.')}</p>
    </section>
    <section id="resources" className={s.panel}><h2>{pick(lang,'Conexiones y recursos','Connections and resources')}</h2><div className={s.actions}>{liveUrl&&<a className={s.button} href={liveUrl} target="_blank" rel="noopener noreferrer">{pick(lang,'Producto','Product')}</a>}{repository&&<a className={s.button} href={repository} target="_blank" rel="noopener noreferrer">{pick(lang,'Repositorio','Repository')}</a>}<Link className={s.button} href={editor}>{pick(lang,'Editar ficha operativa','Edit operations record')}</Link><Link className={s.button} href={`/admin/workspace/library/${project.id}`}>{pick(lang,'Importar nueva versión / ver respaldos','Import new version / view backups')}</Link></div><dl className={s.detail}>{[['deployment','Plataforma / despliegue','Platform / deployment'],['integrations','Integraciones registradas','Recorded integrations'],['resources','Archivos y referencias','Files and references'],['important_dates','Fechas importantes','Important dates']].map(([key,es,en])=><div key={key}><dt>{pick(lang,es,en)}</dt><dd className={s.description}>{typeof op[key]==='string'?String(op[key])||'\u2014':'\u2014'}</dd></div>)}</dl><p className={s.muted}>{pick(lang,'Las referencias no conceden permisos. No guardes contrase\u00f1as ni claves aqu\u00ed.','References do not grant access. Do not store passwords or keys here.')}</p></section>
    <section id="history" className={s.panel}><h2>{pick(lang,'Historial del producto','Product history')}</h2>{audit.error?<DbNotice lang={lang} error={audit.error}/>:<ul className={s.list}>{audit.data.map(a=><li className={s.row} key={a.id}><strong>{a.summary||project.name}</strong><p className={s.muted}>{a.operation} / {a.table_name} / {formatDate(lang,a.created_at,true)} / {a.actor_id??'\u2014'}</p></li>)}</ul>}<p className={s.muted}>{pick(lang,'\u00daltimos 20 eventos de auditor\u00eda de este proyecto. Las solicitudes y pruebas conservan autor y fecha.','Last 20 audit events for this project. Requests and tests preserve author and date.')}</p></section>
  </main>;
}
