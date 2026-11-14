import { operations } from '@/lib/os/project-operations';
import { clientId, groupCompanies, type CompanyRecord } from '@/lib/os/client-hud';
import { requireOwner } from '@/lib/auth/session';
import { CompanyPortfolio } from './company-portfolio';
import { ModuleDeliveryPanel } from './module-delivery-panel';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { pick, formatDate, type Lang } from '@/lib/i18n';
import type { ModuleKey } from '@/lib/os/domain';
import { run, type ProjectRow, type Loaded } from '@/lib/os/data';
import { createProject, updateProject } from '@/app/admin/workspace/project-actions';
import { DbNotice, Empty, Panel, statusLabel } from './ui';
import s from './os.module.css';

export async function ProjectsIndex({lang,module,base,projects,noun,createFields,showArchived,page=1}:{
  lang:Lang;module:ModuleKey;base:string;projects:Loaded<ProjectRow[]>;noun:{es:string;en:string};createFields?:ReactNode;showArchived:boolean;page?:number;
}) {
  const {supabase}=await requireOwner();
  const leadIds=[...new Set((projects.data??[]).filter(p=>!p.client_id).map(p=>clientId(p.settings)).filter((id):id is string=>Boolean(id)))];
  const clientIds=[...new Set((projects.data??[]).map(p=>p.client_id).filter((id):id is string=>Boolean(id)))];
  const [linked,choices,confirmed,clientOptions]=await Promise.all([
    leadIds.length?run<CompanyRecord[]>(supabase.from('crm_leads').select('id,company,contact').in('id',leadIds)):null,
    run<CompanyRecord[]>(supabase.from('crm_leads').select('id,company,contact').eq('archived',false).order('company').limit(200)),
    clientIds.length?run<{id:string;legal_name:string;trade_name:string}[]>(supabase.from('crm_clients').select('id,legal_name,trade_name').in('id',clientIds)):null,
    run<{id:string;legal_name:string;trade_name:string;client_code:string}[]>(supabase.from('crm_clients').select('id,legal_name,trade_name,client_code').neq('status','archived').order('legal_name').limit(200)),
  ]);
  const companyNames=[
    ...(linked?.data??[]).map(c=>({...c,kind:'lead' as const})),
    ...(confirmed?.data??[]).map(c=>({id:c.id,company:c.trade_name||c.legal_name,kind:'client' as const})),
  ];
  return <div>
    {projects.error?<DbNotice lang={lang} error={projects.error}/>:!projects.data.length?<Empty title={pick(lang,`A\u00fan no hay ${noun.es}`,`No ${noun.en} yet`)} body={pick(lang,'Registra un producto creado fuera de Avalon y vincúlalo al cliente del CRM.','Register a product built outside Avalon and link it to its CRM company.')}/>:<CompanyPortfolio lang={lang} module={module} groups={groupCompanies(projects.data,companyNames)}/>}
    {(linked?.error||confirmed?.error)&&<p className={s.meta}>{pick(lang,'No se pudieron leer los nombres del CRM. Las referencias se conservan, sin agrupar empresas por nombre.','CRM names could not be read. References are preserved; companies are not grouped by name.')}</p>}
    <div className={s.actions} style={{marginTop:12}}>
      <Link href={showArchived?base:`${base}?archived=1`}>{showArchived?pick(lang,'Ocultar archivados','Hide archived'):pick(lang,'Mostrar archivados','Show archived')}</Link>
      {!projects.error&&<span className={s.meta}>{pick(lang,'Página','Page')} {page}
        {projects.count!==null?` · ${projects.count} ${pick(lang,'productos totales','total products')}`:''}</span>}
      {page>1&&<Link href={`${base}?${new URLSearchParams({...showArchived?{archived:'1'}:{},page:String(page-1)})}`}>{pick(lang,'Anterior','Previous')}</Link>}
      {!projects.error && (projects.count??0)>page*50&&<Link href={`${base}?${new URLSearchParams({...showArchived?{archived:'1'}:{},page:String(page+1)})}`}>{pick(lang,'Siguiente','Next')}</Link>}
    </div>
    <div id="new"><Panel title={pick(lang,'Agregar producto externo','Add external product')} id="create-title"><form action={createProject} className={s.form}>
      <input type="hidden" name="module" value={module}/>
      <label className={s.field}><span>{pick(lang,'Nombre del producto','Product name')} *</span><input className={s.input} name="name" required maxLength={120} autoComplete="off"/></label>
      <label className={s.field}><span>{pick(lang,'Descripci\u00f3n','Description')}</span><textarea className={s.textarea} name="description" maxLength={2000} rows={3}/></label>
      <details className={s.row}><summary>{pick(lang,'Empresa e identificador Higgsfield, si aplica','Company and Higgsfield ID, when applicable')}</summary>
        <p className={s.meta}>{pick(lang,'Si ya seleccionaste la empresa en la ficha operativa, no repitas su nombre. Si es una empresa nueva, escribe su nombre exacto: Avalon vinculará una ficha coincidente o abrirá un lead nuevo en etapa Nuevo. No se registra una venta.','If you already selected an existing company, leave the name blank. For a new company, enter its exact name: Avalon links an exact unique match or creates a new lead at New stage. This does not record a sale.')}</p>
        <label className={s.field}><span>{pick(lang,'Empresa nueva o por identificar (nombre exacto)','New company or company to match (exact name)')}</span><input className={s.input} name="company_name" maxLength={200} autoComplete="organization" /></label>
        <label className={s.field}><span>{pick(lang,'ID real de sitio/trabajo Higgsfield (opcional)','Real Higgsfield site/job ID (optional)')}</span><input className={s.input} name="higgsfield_ref" maxLength={120} autoComplete="off" placeholder="e.g. site-12345" /></label>
        <p className={s.meta}>{pick(lang,'Para registrar una entrega Higgsfield debes incluir ese ID, una URL HTTPS del proyecto o repositorio en la ficha operativa, y una empresa. La referencia sola no demuestra que el producto esté publicado.','For a Higgsfield delivery provide the ID, an HTTPS project or repository URL in operations, and a company. A reference alone does not prove the product is live.')}</p>
      </details>
      <label className={s.field}><span>{pick(lang,"Herramienta que creó el producto","Product creator")}</span>
        <select className={s.select} name="source_tool" defaultValue="manual">
          <option value="manual">{pick(lang,"Registro manual","Manual registration")}</option>
          <option value="claude_code">Claude Code</option>
          <option value="codex">Codex</option>
          <option value="higgsfield">Higgsfield</option>
          <option value="chatgpt">ChatGPT</option>
          <option value="other">{pick(lang,"Otra herramienta","Other tool")}</option>
        </select>
      </label>
      <label className={s.field}><span>{pick(lang,"Cliente confirmado en Client 360° (opcional)","Confirmed CRM client (optional)")}</span>
        <select name="client_id" className={s.select} defaultValue="">
          <option value="">{pick(lang,"Sin vincular / usar lead del CRM","Not linked / use CRM lead")}</option>
          {(clientOptions.data??[]).map(c=><option key={c.id} value={c.id}>{c.trade_name||c.legal_name} · {c.client_code}</option>)}
        </select>
      </label>
      <p className={s.meta}>{pick(lang,
        "Selecciona un cliente confirmado o un lead del CRM. Si eliges ambos, deben ser el mismo negocio según el ID del lead de origen. No registra una venta.",
        "Select a confirmed client or CRM lead. If both are selected, they must match by originating lead ID. This does not register a sale.")}</p>
      <OperationsFields lang={lang} companies={choices.data??undefined}/>{createFields}
      <div className={s.actions}><button className={s.btnPrimary} type="submit" disabled={Boolean(projects.error)}>{pick(lang,'Registrar producto','Register product')}</button></div>
      {projects.error==='schema_pending'&&<p className={s.meta}>{pick(lang,'Disponible cuando se aplique la migraci\u00f3n de m\u00f3dulos.','Available once the module migration is applied.')}</p>}
    </form></Panel></div>
    <ModuleDeliveryPanel lang={lang} module={module} />
  </div>;
}

export function ProjectSettingsForm({lang,project,returnTo}:{lang:Lang;project:ProjectRow;returnTo?:'settings'}) {
  return <form action={updateProject} className={s.form}>
    <p><Link href={`/admin/workspace/products/${project.id}`}>{pick(lang,'Abrir HUD de este producto: pruebas, mejoras e historial','Open product HUD: tests, improvements and history')}</Link></p>
    <input type="hidden" name="module" value={project.module}/><input type="hidden" name="id" value={project.id}/><input type="hidden" name="version" value={project.version}/>
    {returnTo&&<input type="hidden" name="return" value={returnTo}/>}
    <div className={s.row}><label className={s.field}><span>{pick(lang,'Nombre','Name')} *</span><input className={s.input} name="name" defaultValue={project.name} required maxLength={120}/></label><label className={s.field}><span>{pick(lang,'Estado','Status')}</span><select className={s.select} name="status" defaultValue={project.status}>{(['draft','active','archived'] as const).map(v=><option key={v} value={v}>{statusLabel(lang,v)}</option>)}</select></label></div>
    <label className={s.field}><span>{pick(lang,'Descripci\u00f3n','Description')}</span><textarea className={s.textarea} name="description" defaultValue={project.description} maxLength={2000} rows={3}/></label>
    <OperationsFields lang={lang} value={project.settings.operations}/>
    <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang,'Guardar','Save')}</button><span className={s.meta}>v{project.version} / {pick(lang,'Creado','Created')} {formatDate(lang,project.created_at)}</span></div>
  </form>;
}

function OperationsFields({lang,value,companies}:{lang:Lang;value?:unknown;companies?:CompanyRecord[]}) {
  let data;try {data=operations((value??{}) as Record<string,unknown>);}catch{data=operations({});}
  const fields=[['client_lead_id','Empresa / referencia del CRM','Company / CRM reference'],['responsible','Responsable','Responsible'],['url','URL del proyecto','Project URL'],['repository','Repositorio autorizado','Authorized repository'],['deployment','Plataforma / despliegue','Platform / deployment'],['integrations','Integraciones autorizadas','Authorized integrations'],['important_dates','Fechas importantes','Important dates'],['resources','Archivos y recursos / referencias autorizadas','Files and resources / authorized references'],['tasks','Tareas y seguimiento','Tasks and follow-up']] as const;
  return <details open><summary>{pick(lang,'Empresa y ficha operativa','Company and operations record')}</summary><p className={s.meta}>{pick(lang,'Vincula el registro existente del CRM. Esto no confirma una venta ni activa integraciones. No incluyas claves ni contrase\u00f1as.','Link the existing CRM record. This does not confirm a sale or activate integrations. Do not include keys or passwords.')}</p>{fields.map(([key,es,en])=><label key={key} className={s.field}><span>{pick(lang,es,en)}</span>{key==='client_lead_id'&&companies?.length?<select className={s.select} name={key} defaultValue={data[key]}><option value="">{pick(lang,'Sin vincular todav\u00eda','Not linked yet')}</option>{companies.map(c=><option value={c.id} key={c.id}>{c.company}{c.contact?` / ${c.contact}`:''} / {c.id.slice(0,8)}</option>)}</select>:key==='tasks'||key==='resources'?<textarea className={s.textarea} name={key} defaultValue={data[key]} maxLength={2000} rows={3}/>:<input className={s.input} name={key} defaultValue={data[key]} maxLength={500} type={key==='url'||key==='repository'?'url':'text'}/>}</label>)}{companies&&<p className={s.meta}>{pick(lang,'Selector: hasta 200 registros activos del CRM. Para otras referencias, edita la ficha operativa del proyecto.','Selector: up to 200 active CRM records. For other references, edit the project operations record.')}</p>}{data.url?<a href={data.url} target="_blank" rel="noopener noreferrer">{pick(lang,'Abrir proyecto','Open project')}</a>:null}{data.repository?<p><a href={data.repository} target="_blank" rel="noopener noreferrer">{pick(lang,'Abrir repositorio','Open repository')}</a></p>:null}</details>;
}
