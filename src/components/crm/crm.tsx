import Link from 'next/link';
import { demoEvents, demoLeads, demoProspects, demoUsage, stages } from './demo-data';
import s from './crm.module.css';

export const crmSections = [
  { slug: 'leads', label: 'Leads & Pipeline' },
  { slug: 'calendar', label: 'Calendario Avalon' },
  { slug: 'kpis', label: 'KPI Tracker' },
  { slug: 'hunter', label: 'Lead Hunter' },
  { slug: 'ai-usage', label: 'Medidores de IA' },
] as const;
export type CrmSection = typeof crmSections[number]['slug'];
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

function Leads() {
  return <div className={s.stack}><div className={s.cards}><Metric label="Leads de prueba" value={String(demoLeads.length)}/><Metric label="Valor de pipeline ilustrativo" value={money(demoLeads.filter(l => !['Ganado', 'Perdido'].includes(l.stage)).reduce((sum,l) => sum + l.value,0))}/><Metric label="Oportunidades ganadas" value={String(demoLeads.filter(l => l.stage === 'Ganado').length)}/></div>
    <div className={s.grid}>{stages.map(stage => <section key={stage} className={s.panel}><div className={s.stage}>{stage} · {demoLeads.filter(l => l.stage === stage).length}</div>{demoLeads.filter(l => l.stage === stage).map(l => <div className={s.lead} key={l.id}><strong>{l.company}</strong><small>{l.name} · {l.owner}</small><small>{money(l.value)} · {l.nextAction}</small></div>)}{!demoLeads.some(l => l.stage === stage) && <p className={s.empty}>Sin leads de ejemplo</p>}</section>)}</div>
  </div>;
}
function Metric({label,value,note}:{label:string;value:string;note?:string}) {return <div className={s.card}><div className={s.muted}>{label}</div><div className={s.metric}>{value}</div>{note && <div className={s.muted}>{note}</div>}</div>;}
function Calendar() {return <section className={s.panel}><h2>Agenda compartida · semana ilustrativa</h2><div className={s.tableWrap}><table className={s.table}><thead><tr><th>Día</th><th>Hora</th><th>Evento</th><th>Responsable</th><th>Tipo</th></tr></thead><tbody>{demoEvents.map((e,i)=><tr key={i}><td>{e.day}</td><td>{e.time}</td><td>{e.title}</td><td>{e.owner}</td><td>{e.type}</td></tr>)}</tbody></table></div><p className={s.muted}>Sin sincronización con Google Calendar ni creación de eventos en esta versión.</p></section>;}
function Kpis(){const won=demoLeads.filter(l=>l.stage==='Ganado');const pipeline=demoLeads.filter(l=>!['Ganado','Perdido'].includes(l.stage));return <div className={s.stack}><div className={s.cards}><Metric label="Leads" value={String(demoLeads.length)}/><Metric label="En pipeline" value={String(pipeline.length)}/><Metric label="Ganados" value={String(won.length)}/><Metric label="Conversión ilustrativa" value={Math.round(won.length/demoLeads.length*100)+'%'}/><Metric label="Valor abierto" value={money(pipeline.reduce((sum,l)=>sum+l.value,0))}/><Metric label="Valor ganado" value={money(won.reduce((sum,l)=>sum+l.value,0))}/></div><section className={s.panel}><h2>Estado de oportunidades</h2>{stages.map(stage=><div key={stage} style={{marginBottom:14}}><div className={s.muted}>{stage} · {demoLeads.filter(l=>l.stage===stage).length}</div><div className={s.meter}><div className={s.fill} style={{width:(demoLeads.filter(l=>l.stage===stage).length/demoLeads.length*100)+'%'}}/></div></div>)}</section></div>;}
function Hunter(){return <section className={s.panel}><h2>Prospectos de ejemplo</h2><p className={s.muted}>No se realizan búsquedas externas ni se incorporan contactos reales.</p><div className={s.tableWrap}><table className={s.table}><thead><tr><th>Empresa ficticia</th><th>Industria</th><th>Ubicación</th><th>Score ilustrativo</th><th>Señal</th></tr></thead><tbody>{demoProspects.map(p=><tr key={p.company}><td>{p.company}</td><td>{p.industry}</td><td>{p.location}</td><td><span className={s.pill}>{p.score}/100</span></td><td>{p.signal}</td></tr>)}</tbody></table></div></section>;}
function AiUsage(){return <div className={s.grid}>{demoUsage.map(p=><section className={s.panel} key={p.name}><h2>{p.name}</h2><div className={s.metric}>—</div><div className={s.muted}>Consumo no disponible</div><div className={s.meter}><div className={s.fill} style={{width:'0%'}}/></div><p className={s.muted}>{p.source}. No se han configurado credenciales ni conectores.</p></section>)}</div>;}
export function Crm({section='leads'}:{section?:CrmSection}) {
 const current=crmSections.find(x=>x.slug===section) ?? crmSections[0];
 return <div className={s.wrap}><header className={s.head}><div><div className={s.eyebrow}>Avalon OS / CRM</div><h1 className={s.title}>{current.label}</h1><p className={s.subtitle}>Espacio comercial integrado en el HUD existente de Avalon Core Agency.</p></div><Link href="/admin/dashboard" className={s.link}>← Dashboard</Link></header>
 <div className={s.notice}><strong>Vista de desarrollo:</strong> todos los leads, eventos, cifras y prospectos son ficticios. No hay escrituras a Supabase, conexiones de IA ni operaciones comerciales activas.</div>
 <nav aria-label="Secciones del CRM" className={s.tabs}>{crmSections.map(x=><Link key={x.slug} href={x.slug==='leads'?'/admin/workspace/crm':`/admin/workspace/crm/${x.slug}`} aria-current={section===x.slug?'page':undefined} className={`${s.tab} ${section===x.slug?s.active:''}`}>{x.label}</Link>)}</nav>
 {section==='leads'?<Leads/>:section==='calendar'?<Calendar/>:section==='kpis'?<Kpis/>:section==='hunter'?<Hunter/>:<AiUsage/>}
 </div>;
}
