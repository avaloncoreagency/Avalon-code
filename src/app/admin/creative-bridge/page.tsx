import {manifest} from '@/lib/creative-bridge/continuity';
import {CreativeAsset} from './asset';
import styles from './layout.module.css';
import Link from 'next/link';
import {Suite} from '@/components/suite/suite';
import {requireOwner} from '@/lib/auth/session';
import {CreativeControls} from './controls';
import {getLang} from '@/lib/i18n-server';
import {pick} from '@/lib/i18n';
import {CREATIVE_LIBRARY_LINKS} from './library-navigation';
import {creativeStatus,creativeStatusLabel,filterLibrary} from './catalog';
export const dynamic='force-dynamic';
export default async function CreativeBridge({searchParams}:{searchParams:Promise<{q?:string;state?:string;client?:string}>}){
 const {supabase}=await requireOwner();
 const lang=await getLang();
 const [projects,leads,sales]=await Promise.all([
  supabase.from('os_projects').select('id,name,module,version,client_id,settings,updated_at').eq('settings->creative->>provider','higgsfield').order('updated_at',{ascending:false}).limit(100),
  supabase.from('crm_leads').select('id,company').eq('archived',false).order('company').limit(100),
  supabase.from('crm_sales').select('id,sale_number').eq('status','confirmed').order('created_at',{ascending:false}).limit(100),
 ]);
 const params=await searchParams;
 const catalog=(projects.data??[]).map(project=>{
  const source=project.settings?.creative_continuity;
  let checkpoint:ReturnType<typeof manifest>|null=null;
  try{if(source)checkpoint=manifest(source);}catch{checkpoint=null;}
  return {project,checkpoint,status:creativeStatus(checkpoint,Boolean(source)&&!checkpoint)};
 });
 const visible=filterLibrary(catalog,params??{});
 const selectedState=typeof params?.state==='string'?params.state:'';
 const selectedClient=typeof params?.client==='string'?params.client:'';
 const searchText=typeof params?.q==='string'?params.q.slice(0,80):'';
 const leadNames=new Map((leads.data??[]).map(l=>[l.id,l.company]));
 return <Suite><section className={styles.bridge}><h1>Avalon Creative Bridge</h1><nav aria-label={pick(lang,'Bibliotecas relacionadas','Related libraries')} className={styles.libraryLinks}>{CREATIVE_LIBRARY_LINKS.map(link=><Link key={link.id} href={link.href}>{pick(lang,link.es,link.en)}</Link>)}</nav><p>Proyectos digitales, bibliotecas y CRM. Registrar un borrador o una Preview no confirma una venta ni publica cambios.</p><p>Se muestran los últimos 100 productos creativos y hasta 100 tarjetas activas. Las referencias de recursos no conceden acceso a sus plataformas.</p>
 {projects.error||leads.error||sales.error?<p role="alert">No se pudo leer el bridge. Revisa conexión, permisos y migraciones aprobadas.</p>:<><CreativeControls projects={projects.data??[]} leads={leads.data??[]} sales={sales.data??[]}/><h2>{pick(lang,"Biblioteca por cliente y proyecto","Library by client and project")}</h2><form method="get" action="/admin/creative-bridge" className={styles.filters}>
 <label>{pick(lang,"Buscar proyecto","Find project")}<input type="search" name="q" defaultValue={searchText} maxLength={80} placeholder={pick(lang,"Nombre del proyecto","Project name")}/></label>
 <label>{pick(lang,"Estado","Status")}<select name="state" defaultValue={selectedState}><option value="">{pick(lang,"Todos","All")}</option><option value="imported">{pick(lang,"Ruta local registrada","Registered local path")}</option><option value="pending">{pick(lang,"Pendiente","Pending")}</option><option value="blocked">{pick(lang,"Bloqueado","Blocked")}</option><option value="reference_only">{pick(lang,"Solo referencia","Reference only")}</option></select></label>
 <label>{pick(lang,"Cliente","Client")}<select name="client" defaultValue={selectedClient}><option value="">{pick(lang,"Todos los clientes","All clients")}</option><option value="unassigned">{pick(lang,"Sin asignar","Unassigned")}</option>{(leads.data??[]).map(lead=><option key={lead.id} value={lead.id}>{lead.company}</option>)}</select></label>
 <button type="submit">{pick(lang,"Filtrar","Filter")}</button><Link href="/admin/creative-bridge">{pick(lang,"Limpiar filtros","Clear filters")}</Link>
 </form><p role="status">{pick(lang,`Mostrando ${visible.length} de ${catalog.length} proyectos. Una ruta local registrada no certifica integridad SHA de bytes, licencia, generación Higgsfield ni publicación remota.`,`Showing ${visible.length} of ${catalog.length} projects. A registered local path does not verify byte SHA integrity, licensing, Higgsfield generation or remote publication.`)}</p>
 <ul>{visible.map(({project:p,checkpoint,status})=>{const lead=p.settings?.operations?.client_lead_id;const assets=checkpoint?.assets;return <li key={p.id} style={{padding:16,borderBottom:'1px solid #435374'}}><h3><Link href={`/admin/workspace/products/${p.id}`}>{p.name}</Link></h3><p>Biblioteca: {p.module} · {pick(lang,"Estado de registro","Recorded status")}: <strong>{creativeStatusLabel(status,lang)}</strong> · Versión: {p.version}</p><p>Procedencia: {p.settings?.creative?.provider??'No verificada'} (declarada). Aprobación y publicación remotas: no verificadas en esta pantalla.</p><p>{lead?<Link href={`/admin/workspace/clients/${lead}`}>{leadNames.get(lead)??'Cliente no visible'} · abrir CRM</Link>:'Sin asignar · no se creó un lead'}</p>{p.client_id?<p><Link href={`/admin/workspace/crm/clients/${p.client_id}`}>Abrir Cliente 360</Link></p>:null}<p>{typeof p.settings?.creative?.verified_sale_id==='string'?<Link href={`/admin/workspace/crm/sales/${p.settings.creative.verified_sale_id}`}>Venta vinculada · consultar estado vigente</Link>:null}</p><p>Agente reportado: {p.settings?.creative_continuity?.agent??p.settings?.creative?.agent??'No registrado'}</p><p>Recursos registrados: {Array.isArray(assets)?assets.length:0}</p>{Array.isArray(assets)?<ul>{assets.map(a=><li key={a.id}><CreativeAsset asset={a} assets={assets} lang={lang}/></li>)}</ul>:null}<p>Última actualización: {p.updated_at}</p>{checkpoint?<><p>Rama: {checkpoint.branch} · CI reportada: {checkpoint.ci}</p><p>{checkpoint.evidence?.pull_request?<Link href={checkpoint.evidence.pull_request}>PR</Link>:null} {checkpoint.evidence?.ci_url?<Link href={checkpoint.evidence.ci_url}>Evidencia de CI</Link>:null} {checkpoint.evidence?.preview_url?<Link href={checkpoint.evidence.preview_url}>Preview reportada</Link>:null} {checkpoint.evidence?.demo_url?<Link href={checkpoint.evidence.demo_url}>Demo reportada</Link>:null} {checkpoint.evidence?.production_url?<Link href={checkpoint.evidence.production_url}>URL de producción reportada</Link>:null}</p></>:null}<p>SHA: {p.settings?.creative_continuity?.head_sha??'Sin checkpoint'}</p></li>;})}</ul></>}
 <p>Generación Higgsfield, carga en almacenamiento y publicación externa requieren conexión y aprobación explícitas. Esta pantalla conserva estados y evidencias, sin simular ejecuciones.</p></section></Suite>;
}
