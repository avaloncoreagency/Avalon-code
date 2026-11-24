import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { run } from '@/lib/os/data';
import { pick, formatDate, type Lang } from '@/lib/i18n';
import { journeyAction } from '@/lib/crm/commercial-journey';
import { STATUS_LABEL } from '@/lib/quotes/text';
import type { QuoteStatus } from '@/lib/quotes/model';
import styles from './commercial-journey.module.css';
type Lead = {id:string;stage_id:string;diagnosis_status:string;next_action:string;follow_up_at:string|null;last_interaction_at:string|null};
type Quote = {id:string;quote_number:string;status:QuoteStatus;current_version:number};
export async function CommercialJourney({supabase,lead,lang,verifiedContract,contractError,stageLabel,stageKind}:{supabase:SupabaseClient;lead:Lead;lang:Lang;verifiedContract:boolean;contractError:boolean;stageLabel?:string;stageKind?:string}) {
  // Queries are constrained by canonical IDs and RLS; no new public summary API.
  const [quotes,accepted,sales,client] = await Promise.all([
    run<Quote[]>(supabase.from('crm_quotes').select('id,quote_number,status,current_version',{count:'exact'}).eq('lead_id',lead.id).is('deleted_at',null).order('updated_at',{ascending:false}).limit(10)),
    run<Quote[]>(supabase.from('crm_quotes').select('id,quote_number,status,current_version',{count:'exact'}).eq('lead_id',lead.id).is('deleted_at',null).eq('status','accepted').order('id').limit(2)),
    run<{id:string;sale_number:string;delivery_status:string}[]>(supabase.from('crm_sales').select('id,sale_number,delivery_status',{count:'exact'}).eq('lead_id',lead.id).order('created_at',{ascending:false}).limit(10)),
    run<{id:string}|null>(supabase.from('crm_clients').select('id').eq('origin_lead_id',lead.id).maybeSingle()),
  ]);
  const unavailable=Boolean(quotes.error||accepted.error||sales.error||client.error||contractError);
  const base=`/admin/workspace/crm/lead/${lead.id}`;
  const quotesHref=`/admin/workspace/crm/quotes?lead=${lead.id}`;
  const singleAccepted=accepted.count===1?accepted.data?.[0]:null;
  const action=journeyAction({stage:stageKind==='lost'?'lost':lead.stage_id,diagnosis:lead.diagnosis_status,unavailable,sales:sales.count??0,quotes:quotes.count??0,accepted:accepted.count??0,verifiedContract});
  const actions:Record<typeof action,[string,string,string]>={
    review:[base+'?tab=history','Revisar datos parcialmente disponibles','Review partially available data'],
    sale:[sales.data?.[0]?`/admin/workspace/crm/sales/${sales.data[0].id}`:base,'Abrir venta existente','Open existing sale'],
    quotes:[quotesHref,'Revisar cotizaciones y versiones','Review quotes and versions'],
    contract:[base+'?tab=contract','Revisar y verificar contrato','Review and verify contract'],
    close:[singleAccepted?`/admin/workspace/crm/quotes/${singleAccepted.id}#close-sale`:quotesHref,'Revisar cierre en Sales Center','Review closing in Sales Center'],
    diagnosis:[base+'/discovery','Completar diagnóstico','Complete discovery'],
    create_quote:[`/admin/workspace/crm/quotes/new?lead=${lead.id}`,'Crear cotización vinculada','Create linked quote'],
    contact:[base+'?tab=summary#log-title','Registrar contacto','Record contact'],
    followup:[base+'?tab=summary&edit=1#lead-edit','Programar seguimiento','Schedule follow-up'],
    history:[base+'?tab=history','Revisar pérdida e historial','Review loss and history'],
  };
  const current=actions[action];
  return <section className={styles.journey} aria-labelledby="commercial-journey"><h2 id="commercial-journey">{pick(lang,'Camino comercial','Commercial journey')}</h2>
    <p>{pick(lang,'Solicitud → Lead → Diagnóstico → Cotización → Contrato → Venta → Cliente → Entrega → Cobro. Cada registro conserva su propio estado.','Inquiry → Lead → Discovery → Quote → Contract → Sale → Client → Delivery → Collection. Each record retains its own status.')}</p>
    {unavailable?<p role="status">{pick(lang,'Información parcialmente disponible. Una consulta fallida no significa que no existan registros.','Partially available information. A failed query does not mean that records do not exist.')}</p>:null}
    <dl className={styles.facts}><div><dt>{pick(lang,'Etapa','Stage')}</dt><dd>{stageLabel??lead.stage_id}</dd></div><div><dt>{pick(lang,'Diagnóstico','Discovery')}</dt><dd>{lead.diagnosis_status==='complete'?pick(lang,'Completo','Complete'):lead.diagnosis_status==='in_progress'?pick(lang,'En curso','In progress'):pick(lang,'Pendiente de completar','Pending completion')}</dd></div><div><dt>{pick(lang,'Última interacción','Last interaction')}</dt><dd>{lead.last_interaction_at?formatDate(lang,lead.last_interaction_at,true):pick(lang,'Sin registrar','Not recorded')}</dd></div><div><dt>{pick(lang,'Próxima acción','Next action')}</dt><dd>{lead.next_action||pick(lang,'Sin registrar','Not recorded')}</dd></div><div><dt>{pick(lang,'Seguimiento','Follow-up')}</dt><dd>{['won','lost'].includes(stageKind??lead.stage_id)?pick(lang,'Oportunidad cerrada; consultar tareas de postventa','Closed opportunity; see after-sales tasks'):lead.follow_up_at?formatDate(lang,lead.follow_up_at,true):pick(lang,'Sin programar','Not scheduled')}</dd></div><div><dt>{pick(lang,'Contrato','Contract')}</dt><dd>{contractError?pick(lang,'Desconocido','Unknown'):verifiedContract?pick(lang,'Firmado verificado; no acredita cobro','Verified signed; does not prove collection'):pick(lang,'Sin firma verificada','No verified signature')}</dd></div></dl>
    <div className={styles.links}><Link className={styles.primary} href={current[0]}>{pick(lang,current[1],current[2])}</Link><Link href={quotesHref}>{pick(lang,'Todas las cotizaciones','All quotes')}</Link>{client.data?<Link href={`/admin/workspace/crm/clients/${client.data.id}`}>{pick(lang,'Cliente 360 · proyectos, tareas y cobros','Client 360 · projects, tasks and collections')}</Link>:null}</div>
    <details><summary>{pick(lang,'Cotizaciones y ventas vinculadas','Linked quotes and sales')}</summary>
    <p>{quotes.error?pick(lang,'Cotizaciones: desconocido','Quotes: unknown'):`${pick(lang,'Cotizaciones','Quotes')}: ${quotes.count??'—'}`}</p>
    <ul className={styles.list}>{quotes.data?.map(quote=><li key={quote.id}><Link href={`/admin/workspace/crm/quotes/${quote.id}`}>{quote.quote_number}</Link> · v{quote.current_version} · {pick(lang,...STATUS_LABEL[quote.status])}</li>)}</ul>
    <p>{pick(lang,'Hasta 10 registros recientes; la lista completa conserva filtros y paginación. No se supone que el más reciente sea el aceptado.','Up to 10 recent records; the full list retains filters and pagination. The latest is not assumed to be accepted.')}</p>
    <p>{sales.error?pick(lang,'Ventas: desconocido','Sales: unknown'):`${pick(lang,'Ventas registradas (no equivalen a cobros)','Recorded sales (not collections)')}: ${sales.count??'—'}`}</p>
    <ul className={styles.list}>{sales.data?.map(sale=><li key={sale.id}><Link href={`/admin/workspace/crm/sales/${sale.id}`}>{sale.sale_number}</Link> · {sale.delivery_status}</li>)}</ul></details>
  </section>;
}
