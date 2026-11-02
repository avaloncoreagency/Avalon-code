import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suite } from '@/components/suite/suite';
import { requireOwner } from '@/lib/auth/session';
import { getLang } from '@/lib/i18n-server';
import { pick, formatDate } from '@/lib/i18n';
import { SERVICES, isService, validId, type CompanyRecord } from '@/lib/os/client-hud';
import { PROJECT_COLUMNS, run, countRows, type ProjectRow } from '@/lib/os/data';
import { DbNotice, Flash, statusLabel } from '@/components/os/ui';
import { saveCompanyNote } from '../../products/actions';
import s from '@/components/os/client-hud.module.css';
export const dynamic = 'force-dynamic';
export default async function CompanyHud({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {supabase} = await requireOwner();
  const {id} = await params;
  const p = await searchParams;
  if (!validId(id) || (p.tool != null && !isService(p.tool))) notFound();
  const tool = isService(p.tool)?p.tool:undefined;
  const lang = await getLang();
  const company = await run<CompanyRecord|null>(supabase.from('crm_leads').select('id,company,contact,email,phone,source').eq('id',id).maybeSingle());
  if (!company.error && !company.data) notFound();
  const page = typeof p.page==='string' && /^\d{1,5}$/.test(p.page)?Math.min(Number(p.page),10000):0;
  const archived = p.archived === '1';
  let query = supabase.from('os_projects').select(PROJECT_COLUMNS,{count:'exact'}).eq('settings->operations->>client_lead_id',id);
  if (tool) query=query.eq('module',tool);
  if (!archived) query=query.neq('status','archived');
  const filters: NonNullable<Parameters<typeof countRows>[2]> = [['eq','settings->operations->>client_lead_id',id]];
  if (tool) filters.push(['eq','module',tool]);
  const [projects, active, draft, notes] = await Promise.all([
    run<ProjectRow[]>(query.order('updated_at',{ascending:false}).order('id').range(page*50,page*50+49)),
    countRows(supabase,'os_projects',[...filters,['eq','status','active']]),
    countRows(supabase,'os_projects',[...filters,['eq','status','draft']]),
    run<{id:string;body:string;created_at:string}[]>(supabase.from('crm_activities').select('id,body,created_at').eq('lead_id',id).order('created_at',{ascending:false}).limit(5)),
  ]);
  const path=`/admin/workspace/clients/${id}`;
  const pagination=(n:number)=>`${path}?${new URLSearchParams({...tool?{tool}:{},...archived?{archived:'1'}:{},page:String(n)})}`;
  return <Suite active={tool?SERVICES[tool].slug:'crm'}><main className={s.hud} data-service={tool??'website'}>
    <header className={s.header}><div><p className={s.eyebrow}>Avalon / {tool?SERVICES[tool].name:pick(lang,'Empresas','Companies')}</p><h1>{company.data?.company??pick(lang,'Ficha de empresa','Company profile')}</h1><p className={s.description}>{pick(lang,'Servicios, productos y contexto compartido de esta empresa.','Services, products and shared context for this company.')}</p></div><div className={s.actions}><Link className={s.button} href={tool?`/admin/workspace/${SERVICES[tool].slug}`:'/admin/dashboard'}>{pick(lang,'Volver a la herramienta','Back to the tool')}</Link><Link className={s.button} href={`/admin/workspace/crm?lead=${id}`}>{pick(lang,'Abrir ficha CRM','Open CRM record')}</Link></div></header>
    <Flash lang={lang} ok={typeof p.ok==='string'?p.ok:undefined} error={typeof p.error==='string'?p.error:undefined}/>
    {company.error?<DbNotice lang={lang} error={company.error}/>:<dl className={s.detail}><dt>{pick(lang,'Contacto','Contact')}</dt><dd>{company.data?.contact||'\u2014'}</dd><dt>Email</dt><dd>{company.data?.email||'\u2014'}</dd><dt>{pick(lang,'Tel\u00e9fono','Phone')}</dt><dd>{company.data?.phone||'\u2014'}</dd><dt>{pick(lang,'Origen del cliente','Client source')}</dt><dd>{company.data?.source||'\u2014'}</dd></dl>}
    <div className={s.stats}><div className={s.stat}>{pick(lang,'Proyectos activos','Active projects')}<strong>{active.error?'\u2014':active.count}</strong></div><div className={s.stat}>{pick(lang,'En preparaci\u00f3n','In preparation')}<strong>{draft.error?'\u2014':draft.count}</strong></div><div className={s.stat}>{pick(lang,'Proyectos del filtro','Projects in this filter')}<strong>{projects.error?'\u2014':projects.count}</strong></div></div>
    <nav className={s.tabs} aria-label={pick(lang,'Servicios de la empresa','Company services')}><Link href={path}>{pick(lang,'Todos los servicios','All services')}</Link>{Object.entries(SERVICES).map(([key,v])=><Link key={key} href={`${path}?tool=${key}`} aria-current={tool===key?'page':undefined}>{v.name}</Link>)}</nav>
    {projects.error?<DbNotice lang={lang} error={projects.error}/>:<><div className={s.grid}>{projects.data.map(project=><Link key={project.id} className={s.company} href={`/admin/workspace/products/${project.id}`}><p className={s.eyebrow}>{SERVICES[project.module].name}</p><h2>{project.name}</h2><p className={s.description}>{project.description||pick(lang,'Sin descripci\u00f3n registrada.','No description recorded.')}</p><span className={s.tag}>{statusLabel(lang,project.status)}</span><p className={s.muted}>{formatDate(lang,project.updated_at)}</p><strong>{pick(lang,'Abrir HUD del producto','Open product HUD')} &rarr;</strong></Link>)}</div>{!projects.data.length&&<p className={s.empty}>{pick(lang,'No hay proyectos vinculados para este servicio.','No linked projects for this service.')}</p>}<div className={s.actions}>{page>0&&<Link className={s.button} href={pagination(page-1)}>{pick(lang,'Anterior','Previous')}</Link>}<span>{pick(lang,'P\u00e1gina','Page')} {page+1}</span>{(page+1)*50<(projects.count??0)&&<Link className={s.button} href={pagination(page+1)}>{pick(lang,'Siguiente','Next')}</Link>}<Link href={`${path}?${new URLSearchParams({...tool?{tool}:{},...!archived?{archived:'1'}:{}})}`}>{archived?pick(lang,'Ocultar archivados','Hide archived'):pick(lang,'Incluir archivados','Include archived')}</Link></div></>}
    <section className={s.panel}><h2>{pick(lang,'Descripci\u00f3n y contexto de empresa','Company description and context')}</h2><p className={s.muted}>{pick(lang,'Notas compartidas con la ficha del CRM. Se muestran las cinco m\u00e1s recientes, sin duplicar el cliente.','Notes shared with the CRM record. Showing the five most recent, without duplicating the client.')}</p>{notes.error?<DbNotice lang={lang} error={notes.error}/>:<ul className={s.list}>{notes.data.map(note=><li className={s.row} key={note.id}><p className={s.description}>{note.body}</p><small>{formatDate(lang,note.created_at,true)}</small></li>)}</ul>}<form action={saveCompanyNote} className={s.form}><input type="hidden" name="company_id" value={id}/><label className={s.field}>{pick(lang,'A\u00f1adir descripci\u00f3n, necesidades o contexto','Add description, needs or context')}<textarea name="body" required maxLength={4000} rows={4}/></label><button className={s.button} disabled={Boolean(company.error||notes.error)}>{pick(lang,'Guardar nota de empresa','Save company note')}</button></form></section>
  </main></Suite>;
}
