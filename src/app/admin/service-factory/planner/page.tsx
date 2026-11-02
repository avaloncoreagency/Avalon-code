import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Unavailable, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { createSolutionPlan } from "./actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type Service = { id:string; code:string; name:string; name_en:string; billing_type:string;
  active:boolean; readiness:string; suggested_price:string|null; estimated_cost:string|null; estimated_hours:string|null };
type Client = { id:string; legal_name:string; client_code:string };
type Plan = { id:string; title:string; client_id:string|null; status:string; created_at:string;
  crm_clients:{legal_name:string}|null };

const ERROR: Record<string,[string,string]> = {
  missing:["Faltan campos obligatorios.","Required fields are missing."],
  invalid:["Formulario inválido.","Invalid form."],
  amount:["Revisa importes y porcentajes.","Check amounts and percentages."],
  duplicate:["No repitas el mismo servicio: aumenta su cantidad.","Avoid duplicate services; increase quantity instead."],
  too_long:["Un campo supera el tamaño permitido.","A field exceeds its allowed length."],
  lines:["Selecciona al menos un servicio y una cantidad válida.","Select at least one service and a valid quantity."],
  planner_client_missing:["No se encontró el cliente seleccionado.","Selected client was not found."],
  planner_service_missing:["Hay un servicio inexistente.","A service could not be found."],
  planner_invalid_price:["Hay un precio inválido.","A price is invalid."],
  schema_pending:["Falta la migración del Solution Planner en esta base.","Solution Planner migration is missing from this database."],
  unavailable:["No se pudo crear el borrador. Inténtalo de nuevo.","Unable to create the draft. Try again."],
};
const pairs = (lang:"es"|"en", values:[string,string]) => pick(lang,values[0],values[1]);

export default async function SolutionPlannerPage({searchParams}:{searchParams:Promise<Query>}) {
  const {supabase} = await requireOwner();
  const lang = await getLang();
  const params = await searchParams;
  const [catalog, clients, plans] = await Promise.all([
    run<Service[]>(supabase.from("crm_service_catalog")
      .select("id,code,name,name_en,billing_type,active,readiness,suggested_price,estimated_cost,estimated_hours")
      .order("department_id").order("name").limit(150)),
    run<Client[]>(supabase.from("crm_clients")
      .select("id,legal_name,client_code").neq("status","archived").order("legal_name").limit(200)),
    run<Plan[]>(supabase.from("crm_solution_plans")
      .select("id,title,client_id,status,created_at,crm_clients(legal_name)")
      .order("created_at",{ascending:false}).limit(40)),
  ]);
  const error = q(params,"error");
  const invalid = catalog.error ?? clients.error ?? plans.error;
  return <Suite active="service-factory"><div className={s.hud}>
    <OpsHeader lang={lang} active="factory" crm="sales"
      eyebrow="AVALON / SERVICE FACTORY / SOLUTION PLANNER"
      title={pick(lang,"Planificador de soluciones","Solution Planner")}
      lead={pick(lang,"Combina servicios reales del catálogo para estudiar un proyecto y estimar precio, horas y margen. Únicamente borradores internos: no se envían propuestas ni se generan ventas.", "Combine real catalog services to assess a project and estimate price, labor and margins. Internal drafts only: no proposals are sent and no sales are created.")}
      actions={<Link className={s.button} href="/admin/service-factory">{pick(lang,"Volver al catálogo","Back to catalog")}</Link>}/>
    {error && <p className={s.flash} data-tone="error" role="alert">{pairs(lang,ERROR[error]??ERROR.unavailable)}</p>}
    {invalid ? <Unavailable lang={lang} code={invalid}/> : <>
      <section className={s.panel} aria-labelledby="plan-create">
        <header><h2 id="plan-create">{pick(lang,"Preparar presupuesto interno","Prepare an internal estimate")}</h2>
          <span className={s.muted}>{pick(lang,"Sin IA externa · sin cargos nuevos","No external AI · no new subscriptions")}</span></header>
        <form action={createSolutionPlan} className={s.form}>
          <input name="idempotency_key" type="hidden" value={randomUUID()}/>
          <div className={s.row}>
            <label className={s.field}>{pick(lang,"Título del proyecto *","Project title *")}
              <input name="title" required maxLength={160} minLength={3} placeholder={pick(lang,"Web + CRM para empresa local","Website + CRM for a local business")}/></label>
            <label className={s.field}>{pick(lang,"Empresa vinculada (opcional)","Related company (optional)")}
              <select name="client_id" defaultValue="">
                <option value="">{pick(lang,"Sin empresa todavía","No company yet")}</option>
                {(clients.data??[]).map(c=><option key={c.id} value={c.id}>{c.legal_name} · {c.client_code}</option>)}
              </select></label>
            <label className={s.field}>{pick(lang,"Sector","Industry")}
              <input name="industry" maxLength={120} placeholder={pick(lang,"Servicios locales","Local services")}/></label>
          </div>
          <div className={s.row}>
            <label className={s.field}>{pick(lang,"Problema del negocio","Business problem")}
              <textarea name="problem" rows={3} maxLength={2000} placeholder={pick(lang,"Se pierden consultas y seguimientos...","Inquiries and follow-ups are being lost...")}/></label>
            <label className={s.field}>{pick(lang,"Resultado deseado","Desired outcome")}
              <textarea name="objective" rows={3} maxLength={2000} placeholder={pick(lang,"Captar leads y organizar contactos","Capture leads and organize contacts")}/></label>
          </div>
          <div className={s.row}>
            <label className={s.field}>{pick(lang,"Costo interno por hora (USD)","Internal hourly cost (USD)")}
              <input name="hourly_rate" inputMode="decimal" placeholder={pick(lang,"Pendiente de estimar","Estimate pending")}/></label>
            <label className={s.field}>{pick(lang,"Contingencia (%)","Contingency (%)")}
              <input name="contingency_percent" inputMode="decimal" defaultValue="10"/></label>
            <label className={s.field}>{pick(lang,"Moneda de referencia","Estimate currency")}
              <input readOnly value="USD" aria-label={pick(lang,"Moneda: dólares estadounidenses","Currency: US dollars")}/></label>
          </div>
          <fieldset className={s.fieldset}>
            <legend>{pick(lang,"Servicios del paquete (máximo cinco)","Package services (maximum five)")}</legend>
            <p className={s.muted}>{pick(lang,
              "Un servicio en borrador o no certificado puede incluirse para investigación, pero no aprobarse como oferta hasta revisar precios, costos, horas y disponibilidad.",
              "A draft or uncertified service may be included for planning, but cannot be approved until price, cost, labor and availability are verified.")}</p>
            {[0,1,2,3,4].map(i=><div className={s.row} key={i}>
              <label className={s.field}>{pick(lang,"Servicio","Service")} {i+1}{i===0?" *":""}
                <select name={`line_${i}_service`} defaultValue="" required={i===0}>
                  <option value="">{pick(lang,"Seleccionar del catálogo","Choose from catalog")}</option>
                  {(catalog.data??[]).map(c=><option key={c.id} value={c.id}>
                    {lang==="en"?(c.name_en||c.name):c.name} · {c.billing_type}
                    {c.active&&c.readiness==="sellable"?" ✓":pick(lang," · por revisar"," · review needed")}
                  </option>)}
                </select></label>
              <label className={s.field}>{pick(lang,"Cantidad","Quantity")}
                <input name={`line_${i}_quantity`} type="number" min={1} max={10} step={1} defaultValue="1"/></label>
              <label className={s.field}>{pick(lang,"Precio por unidad USD (vacío = catálogo)","Unit price USD (blank = catalog)")}
                <input name={`line_${i}_price`} inputMode="decimal" placeholder={pick(lang,"Usar precio del catálogo","Use catalog price")}/></label>
            </div>)}
          </fieldset>
          <label className={s.field}>{pick(lang,"Supuestos, dependencias y restricciones","Assumptions, dependencies and constraints")}
            <textarea name="assumptions" maxLength={3000} rows={3} placeholder={pick(lang,
              "Se requiere aprobación de acceso y contenido del cliente. No incluye compras de APIs.",
              "Requires client approval for access and content. Does not include third-party API purchases.")}/></label>
          <div className={s.actions}>
            <button className={`${s.button} ${s.primary}`} type="submit">
              {pick(lang,"Guardar presupuesto preliminar","Save preliminary estimate")}
            </button>
            <span className={s.muted}>{pick(lang,"Guarda una instantánea de precios y costos; no crea una venta.","Saves a price/cost snapshot; does not create a sale.")}</span>
          </div>
        </form>
      </section>
      <section className={s.panel} aria-labelledby="saved-plans">
        <header><h2 id="saved-plans">{pick(lang,"Planes guardados","Saved plans")}</h2></header>
        {plans.data.length===0 ? <p className={s.empty}>{pick(lang,"Aún no hay estimaciones.","No estimates yet.")}</p> :
          <div className={s.grid}>{plans.data.map(p=><Link key={p.id} className={s.card}
            href={`/admin/service-factory/planner/${p.id}`}>
            <h3>{p.title}</h3>
            <p className={s.muted}>{p.crm_clients?.legal_name??pick(lang,"Sin empresa vinculada","No linked company")}</p>
            <p className={s.muted}>{p.status==="reviewed"
              ? pick(lang,"Revisado internamente","Internally reviewed")
              : pick(lang,"Borrador","Draft")}</p>
          </Link>)}</div>}
      </section>
    </>}
  </div></Suite>;
}
