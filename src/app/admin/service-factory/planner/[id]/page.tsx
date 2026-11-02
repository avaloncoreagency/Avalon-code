import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Unavailable, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { estimateByCadence, showUsd, type BillingCycle } from "@/lib/service-factory/planner";
import { reviewSolutionPlan } from "../actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type Plan = {
  id:string; title:string; client_id:string|null; industry:string; problem:string;
  objective:string; assumptions:string; currency:string;
  hourly_rate:string|null; contingency_percent:string; status:string;
  reviewed_at:string|null; version:number; crm_clients:{legal_name:string}|null;
};
type PlanLine = {
  id:string; service_id:string; code_snapshot:string; name_snapshot:string;
  quantity:number; position:number; unit_price:string|null; price_source:string;
  direct_cost:string|null; estimated_hours:string|null;
  readiness_snapshot:string; billing_type:BillingCycle; scope_snapshot:string;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR: Record<string,[string,string]> = {
  planner_not_ready:["No se puede aprobar todavía: todos los servicios deben estar activos y aprobados para vender, con precio, costo directo, horas y tarifa por hora conocidos.","Cannot review yet: all services must be active and approved to sell, with known price, direct cost, hours and hourly rate."],
  planner_conflict:["El plan cambió. Recarga y vuelve a intentar.","The plan changed. Reload and retry."],
  planner_not_found:["No se encontró el plan.","Plan not found."],
  schema_pending:["La migración del planificador aún no está aplicada.","Planner migration has not been applied."],
  unavailable:["No se pudo aprobar. Revisa la conexión.","Unable to review. Check the connection."],
};
const cycleName=(lang:"es"|"en",cycle:BillingCycle)=>
  cycle==="monthly"?pick(lang,"Mensual","Monthly"):
  cycle==="annual"?pick(lang,"Anual","Annual"):pick(lang,"Pago único","One-time");

export default async function SolutionPlanDetail({
  params,searchParams
}:{params:Promise<{id:string}>;searchParams:Promise<Query>}) {
  const {id}=await params;
  if(!UUID.test(id)) notFound();
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const p=await searchParams;
  const [plan,lines]=await Promise.all([
    run<Plan|null>(supabase.from("crm_solution_plans")
      .select("id,title,client_id,industry,problem,objective,assumptions,currency,hourly_rate,contingency_percent,status,reviewed_at,version,crm_clients(legal_name)")
      .eq("id",id).maybeSingle()),
    run<PlanLine[]>(supabase.from("crm_solution_plan_lines")
      .select("id,service_id,code_snapshot,name_snapshot,quantity,position,unit_price,price_source,direct_cost,estimated_hours,readiness_snapshot,billing_type,scope_snapshot")
      .eq("plan_id",id).order("position")),
  ]);
  if(!plan.error&&!plan.data) notFound();
  const totals=!lines.error&&!plan.error&&plan.data
    ? estimateByCadence(lines.data,plan.data.hourly_rate,plan.data.contingency_percent):[];
  const err=q(p,"error"),ok=q(p,"ok");
  return <Suite active="service-factory"><div className={s.hud}>
    <OpsHeader lang={lang} active="factory" crm="sales"
      eyebrow="AVALON / SERVICE FACTORY / SOLUTION PLANNER"
      title={plan.data?.title??pick(lang,"Presupuesto interno","Internal estimate")}
      lead={pick(lang,"Borrador privado, sin compromiso comercial. Precios y alcance guardados como instantánea; el margen es solo una estimación, no dinero cobrado.","Private, non-binding draft. Prices and scope are saved as a snapshot; margins are only estimates, not collected revenue.")}
      actions={<Link className={s.button} href="/admin/service-factory/planner">
        {pick(lang,"Volver al planificador","Back to planner")}</Link>}/>
    {err&&<p className={s.flash} data-tone="error" role="alert">{pick(lang,...(ERROR[err]??ERROR.unavailable))}</p>}
    {ok==="created"&&<p className={s.flash} data-tone="ok" role="status">{pick(lang,"Borrador guardado.","Draft saved.")}</p>}
    {ok==="reviewed"&&<p className={s.flash} data-tone="ok" role="status">{pick(lang,"Presupuesto revisado internamente. No se ha enviado ni vendido.","Estimate reviewed internally. Nothing was sent or sold.")}</p>}
    {plan.error?<Unavailable lang={lang} code={plan.error}/>:lines.error?<Unavailable lang={lang} code={lines.error}/>:plan.data&&<>
      <section className={s.panel}>
        <header><h2>{pick(lang,"Diagnóstico y estado","Discovery and status")}</h2>
          <span className={s.tag} data-tone={plan.data.status==="reviewed"?"ok":"warn"}>
            {plan.data.status==="reviewed"?pick(lang,"Revisado internamente","Internally reviewed"):pick(lang,"Borrador","Draft")}
          </span></header>
        <dl className={s.detail}>
          <dt>{pick(lang,"Cliente","Client")}</dt><dd>{plan.data.client_id?<Link href={`/admin/workspace/crm/clients/${plan.data.client_id}`}>{plan.data.crm_clients?.legal_name??"—"}</Link>:pick(lang,"Todavía no asociado","Not linked yet")}</dd>
          <dt>{pick(lang,"Sector","Industry")}</dt><dd>{plan.data.industry||"—"}</dd>
          <dt>{pick(lang,"Problema","Problem")}</dt><dd style={{whiteSpace:"pre-wrap"}}>{plan.data.problem||"—"}</dd>
          <dt>{pick(lang,"Objetivo","Objective")}</dt><dd style={{whiteSpace:"pre-wrap"}}>{plan.data.objective||"—"}</dd>
          <dt>{pick(lang,"Supuestos","Assumptions")}</dt><dd style={{whiteSpace:"pre-wrap"}}>{plan.data.assumptions||"—"}</dd>
          <dt>{pick(lang,"Costo/hora interno","Internal hourly cost")}</dt><dd>{plan.data.hourly_rate===null?pick(lang,"Sin determinar","Unknown"):`${plan.data.hourly_rate} USD/h`}</dd>
          <dt>{pick(lang,"Contingencia sobre costo","Cost contingency")}</dt><dd>{plan.data.contingency_percent}%</dd>
        </dl>
      </section>
      <section className={s.panel}>
        <header><h2>{pick(lang,"Servicios cotizados","Quoted services")}</h2></header>
        <div className={s.tableWrap}><table className={s.table}>
          <thead><tr><th>{pick(lang,"Servicio","Service")}</th>
            <th>{pick(lang,"Frecuencia","Cadence")}</th><th>{pick(lang,"Cantidad","Qty")}</th>
            <th>{pick(lang,"Precio por unidad","Unit price")}</th>
            <th>{pick(lang,"Costo directo por unidad","Direct cost / unit")}</th>
            <th>{pick(lang,"Horas por unidad","Hours / unit")}</th></tr></thead>
          <tbody>{lines.data.map(item=><tr key={item.id}>
            <td>{item.name_snapshot}<div className={s.muted}>{item.code_snapshot} · {item.readiness_snapshot}</div></td>
            <td>{cycleName(lang,item.billing_type)}</td><td>{item.quantity}</td>
            <td>{item.unit_price===null?pick(lang,"Sin datos","Unknown"):showUsd(Math.round(Number(item.unit_price)*100),lang)}</td>
            <td>{item.direct_cost===null?pick(lang,"Sin datos","Unknown"):showUsd(Math.round(Number(item.direct_cost)*100),lang)}</td>
            <td>{item.estimated_hours??pick(lang,"Sin datos","Unknown")}</td>
          </tr>)}</tbody></table></div>
        <p className={s.muted}>{pick(lang,
          "La frecuencia de cada producto es independiente: no sumamos un pago único con mensualidades o anualidades. El costo registrado es un supuesto de producción, no un gasto real.",
          "Each product has its own cadence: one-time, monthly and annual prices are never added together. Recorded cost is an estimate, not actual expenditure.")}</p>
      </section>
      <section className={s.panel}>
        <header><h2>{pick(lang,"Economía estimada por frecuencia","Estimated economics by billing cadence")}</h2></header>
        <div className={s.grid}>{totals.map(t=><div key={t.billing_type} className={s.card}>
          <h3>{cycleName(lang,t.billing_type)} · {t.services} {pick(lang,"servicio(s)","service(s)")}</h3>
          <dl className={s.detail}>
            <dt>{pick(lang,"Ingresos presupuestados","Quoted revenue")}</dt><dd>{showUsd(t.revenueCents,lang)}</dd>
            <dt>{pick(lang,"Costo directo","Direct cost")}</dt><dd>{showUsd(t.directCostCents,lang)}</dd>
            <dt>{pick(lang,"Costo de horas","Labor cost")}</dt><dd>{showUsd(t.laborCents,lang)}</dd>
            <dt>{pick(lang,"Costo total con contingencia","Total cost with contingency")}</dt><dd>{showUsd(t.totalCostCents,lang)}</dd>
            <dt>{pick(lang,"Margen estimado","Estimated margin")}</dt><dd><strong>{showUsd(t.marginCents,lang)}</strong></dd>
            <dt>{pick(lang,"Porcentaje de margen","Margin percentage")}</dt><dd>{t.marginPercent===null?pick(lang,"Sin datos","Unknown"):`${t.marginPercent.toFixed(1)}%`}</dd>
          </dl>
        </div>)}</div>
      </section>
      <section className={s.panel}>
        <header><h2>{pick(lang,"Revisión humana","Human review")}</h2></header>
        <p className={s.muted}>{pick(lang,
          "Para aprobar internamente: cada producto debe estar activo y revisado en el catálogo, con precio, costo directo, horas y costo/hora. Esto NO crea un contrato, factura, pago, proyecto ni comunicación con clientes.",
          "To review internally: every product must be active and approved in the catalog, with known price, direct cost, hours and hourly rate. This does NOT create a contract, invoice, payment, project or customer communication.")}</p>
        {plan.data.status==="draft"?<form action={reviewSolutionPlan} className={s.actions}>
          <input name="plan_id" type="hidden" value={plan.data.id}/>
          <input name="version" type="hidden" value={plan.data.version}/>
          <button className={`${s.button} ${s.primary}`} type="submit">{pick(lang,"Aprobar presupuesto interno","Approve internal estimate")}</button>
        </form>:<p className={s.flash} data-tone="ok">{pick(lang,
          "Revisión completada. El siguiente paso comercial se hace por separado desde Ventas.",
          "Review complete. Any commercial step must be performed separately in Sales.")}</p>}
        {plan.data.status==="reviewed"&&<Link className={s.button} href={plan.data.client_id
          ?`/admin/workspace/crm/sales/new?client=${plan.data.client_id}`
          :"/admin/workspace/crm/sales/new"}>
          {pick(lang,"Abrir Ventas (seleccionar servicios manualmente)","Open Sales (select services manually)")}</Link>}
      </section>
    </>}
  </div></Suite>;
}
