import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { countRows, run } from "@/lib/os/data";
import styles from "../../growth/growth.module.css";
export const dynamic = "force-dynamic";

type SalesMetric = {currency:string;sales:number;contracted:string;collected:string;recurring_monthly:string};
function safeUsd(value:unknown,lang:"es"|"en"):string{
 if(typeof value!=="string" && typeof value!=="number")return "—";
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return "—";
 return new Intl.NumberFormat(lang==="es"?"es-US":"en-US",{style:"currency",currency:"USD"}).format(n);
}
function showCount(value:number|null):string{return value===null?"—":String(value);}
export default async function CommercialOverviewPage(){
 const {supabase}=await requireOwner();
 const lang=await getLang();
 const [leads,hotLeads,clients,sales,submissions,funnels,orders]=await Promise.all([
  countRows(supabase,"crm_leads",[["eq","audience","agency_b2b"],["eq","archived","false"]]),
  countRows(supabase,"crm_leads",[["eq","audience","agency_b2b"],["eq","archived","false"],["eq","priority","high"]]),
  countRows(supabase,"crm_clients",[["eq","status","active"]]),
  run<SalesMetric[]>(supabase.rpc("crm_sales_metrics")),
  countRows(supabase,"crm_growth_funnel_submissions"),
  countRows(supabase,"crm_growth_funnels",[["eq","status","active"]]),
  countRows(supabase,"crm_work_orders",[["not_in","status",["delivered","cancelled"]]]),
 ]);
 const usd=sales.error?null:sales.data?.find(item=>item.currency==="USD")??null;
 const cards=[
  {name:pick(lang,"Leads B2B sin archivar","Unarchived B2B leads"),value:showCount(leads.count),detail:"CRM / agency_b2b"},
  {name:pick(lang,"Leads B2B de alta prioridad","High-priority B2B leads"),value:showCount(hotLeads.count),detail:"CRM / agency_b2b"},
  {name:pick(lang,"Clientes activos","Active clients"),value:showCount(clients.count),detail:"CRM / crm_clients"},
  {name:pick(lang,"Ventas confirmadas USD","Confirmed sales USD"),value:usd&&Number.isSafeInteger(usd.sales)&&usd.sales>=0?String(usd.sales):"—",detail:"crm_sales_metrics"},
  {name:pick(lang,"Ingresos contratados USD","Contracted USD"),value:safeUsd(usd?.contracted,lang),detail:"crm_sales_metrics"},
  {name:pick(lang,"Cobrado por Avalon USD","Collected by Avalon USD"),value:safeUsd(usd?.collected,lang),detail:"crm_sales_metrics"},
  {name:pick(lang,"Recurrente contratado / mes USD","Contracted recurring / month USD"),value:safeUsd(usd?.recurring_monthly,lang),detail:"crm_sales_metrics"},
  {name:pick(lang,"Solicitudes registradas en funnels","Recorded funnel submissions"),value:showCount(submissions.count),detail:"crm_growth_funnel_submissions"},
  {name:pick(lang,"Funnels activos","Active funnels"),value:showCount(funnels.count),detail:"crm_growth_funnels"},
  {name:pick(lang,"Órdenes abiertas","Open work orders"),value:showCount(orders.count),detail:"crm_work_orders"},
 ];
 return <Suite active="marketing-hub"><main className={styles.page}>
  <header className={styles.hero}><span className={styles.eyebrow}>Commercial Foundation / Verified overview</span>
   <h1>{pick(lang,"Panel comercial de datos reales","Verified commercial overview")}</h1>
   <p>{pick(lang,"Lectura privada de fuentes existentes. Un guion significa consulta no disponible o ningún registro USD; NO equivale a cero.",
    "Read-only view of existing sources. A dash means unavailable data or no USD row; it does NOT mean zero.")}</p>
   <nav className={styles.toolbar} aria-label="Commercial overview">
    <Link href="/admin/workspace/marketing-hub/commercial">Commercial Foundation</Link>
    <Link href="/admin/workspace/crm/desk">CRM Desk</Link><Link href="/admin/workspace/crm/sales">Sales</Link>
   </nav>
  </header>
  <section className={styles.section} aria-labelledby="metrics-title">
   <h2 id="metrics-title">{pick(lang,"Indicadores con origen verificable","Source-backed indicators")}</h2>
   <div className={styles.grid}>{cards.map(card=><article className={styles.card} key={card.name}>
    <h3>{card.name}</h3>
    <p style={{fontSize:"1.5rem",fontVariantNumeric:"tabular-nums"}}><strong>{card.value}</strong></p>
    <p className={styles.note}>{pick(lang,"Origen","Source")}: {card.detail}</p>
   </article>)}</div>
  </section>
  <section className={styles.section} aria-labelledby="not-connected-title">
   <h2 id="not-connected-title">{pick(lang,"Aún sin fuente verificada","Awaiting verified sources")}</h2>
   <div className={styles.card}>
    <p>{pick(lang,
      "ROI, ROAS, visitas, CPL, beneficio real, comisiones B2C y gasto de Meta Ads siguen como N/D. No se simulan valores para llenar el dashboard.",
      "ROI, ROAS, visits, CPL, actual profit, B2C commissions and Meta Ads spend remain N/A. No demo numbers are substituted.")}</p>
    <p className={styles.note}>{pick(lang,
      "Ventas facturadas no son ingresos cobrados; los trabajos de contratistas no son ingresos propios de Avalon.",
      "Contracted revenue is not collected cash; contractor job totals are not Avalon revenue.")}</p>
   </div>
  </section>
 </main></Suite>;
}
