import {manifest} from '@/lib/creative-bridge/continuity';
import {CreativeAsset} from './asset';
import styles from './layout.module.css';
import Link from 'next/link';
import {Suite} from '@/components/suite/suite';
import {requireOwner} from '@/lib/auth/session';
import {CreativeControls} from './controls';
export const dynamic='force-dynamic';
export default async function CreativeBridge(){
 const {supabase}=await requireOwner();
 const [projects,leads,sales]=await Promise.all([
  supabase.from('os_projects').select('id,name,module,version,client_id,settings,updated_at').eq('settings->creative->>provider','higgsfield').order('updated_at',{ascending:false}).limit(100),
  supabase.from('crm_leads').select('id,company').eq('archived',false).order('company').limit(100),
  supabase.from('crm_sales').select('id,sale_number').eq('status','confirmed').order('created_at',{ascending:false}).limit(100),
 ]);
 return <Suite><section className={styles.bridge}><h1>Avalon Creative Bridge</h1><p>Proyectos digitales, bibliotecas y CRM. Registrar un borrador o una Preview no confirma una venta ni publica cambios.</p><p>Se muestran los últimos 100 productos creativos y hasta 100 tarjetas activas. Las referencias de recursos no conceden acceso a sus plataformas.</p>
 {projects.error||leads.error||sales.error?<p role="alert">No se pudo leer el bridge. Revisa conexión, permisos y migraciones aprobadas.</p>:<><CreativeControls projects={projects.data??[]} leads={leads.data??[]} sales={sales.data??[]}/><h2>Productos y proyectos</h2><ul>{projects.data?.map(p=>{const lead=p.settings?.operations?.client_lead_id;let checkpoint;try{checkpoint=manifest(p.settings?.creative_continuity);}catch{checkpoint=null;}const assets=checkpoint?.assets;return <li key={p.id} style={{padding:16,borderBottom:'1px solid #435374'}}><h3><Link href={`/admin/workspace/products/${p.id}`}>{p.name}</Link></h3><p>{p.module} · {p.settings?.creative?.state??'reference_only'} · v{p.version}</p><p>{lead?<Link href={`/admin/workspace/clients/${lead}`}>Cliente asociado · abrir CRM</Link>:'Sin asignar · no se creó un lead'}</p>{p.client_id?<p><Link href={`/admin/workspace/crm/clients/${p.client_id}`}>Abrir Cliente 360</Link></p>:null}<p>{typeof p.settings?.creative?.verified_sale_id==='string'?<Link href={`/admin/workspace/crm/sales/${p.settings.creative.verified_sale_id}`}>Venta vinculada · consultar estado vigente</Link>:null}</p><p>Agente reportado: {p.settings?.creative_continuity?.agent??p.settings?.creative?.agent??'No registrado'}</p><p>Recursos registrados: {Array.isArray(assets)?assets.length:0}</p>{Array.isArray(assets)?<ul>{assets.map(a=><li key={a.id}><CreativeAsset asset={a} assets={assets}/></li>)}</ul>:null}<p>Última actualización: {p.updated_at}</p>{checkpoint?<><p>Rama: {checkpoint.branch} · CI reportada: {checkpoint.ci}</p><p>{checkpoint.evidence?.pull_request?<Link href={checkpoint.evidence.pull_request}>PR</Link>:null} {checkpoint.evidence?.ci_url?<Link href={checkpoint.evidence.ci_url}>Evidencia de CI</Link>:null} {checkpoint.evidence?.preview_url?<Link href={checkpoint.evidence.preview_url}>Preview reportada</Link>:null} {checkpoint.evidence?.demo_url?<Link href={checkpoint.evidence.demo_url}>Demo reportada</Link>:null} {checkpoint.evidence?.production_url?<Link href={checkpoint.evidence.production_url}>URL de producción reportada</Link>:null}</p></>:null}<p>SHA: {p.settings?.creative_continuity?.head_sha??'Sin checkpoint'}</p></li>;})}</ul></>}
 <p>Generación Higgsfield, carga en almacenamiento y publicación externa requieren conexión y aprobación explícitas. Esta pantalla conserva estados y evidencias, sin simular ejecuciones.</p></section></Suite>;
}
