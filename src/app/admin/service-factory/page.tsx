import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Unavailable, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, type Lang } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { SERVICE_FAMILIES, SERVICE_READINESS, SERVICE_DEPARTMENTS, SERVICE_BILLING } from "@/lib/service-factory/domain";
import { saveCatalogService, setCatalogAvailability } from "./actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type ServiceRow = {
  id: string; code: string; name: string; name_en: string;
  department_id: string; billing_type: string; suggested_price: string | null;
  family: string; readiness: string; active: boolean;
  deliverables: string; requirements: string; exclusions: string;
  estimated_hours: string | null; estimated_cost: string | null;
  qa_checklist: string[]; task_template: unknown; template_revision: number;
  version: number; crm_departments: { label: string } | null;
};

const FAMILY: Record<string, [string,string]> = {
  general: ["General","General"], web: ["Web y aplicaciones","Web & apps"],
  ecommerce: ["Comercio electrónico","E-commerce"], crm: ["CRM y ventas","CRM & sales"],
  ai: ["Agentes de IA","AI agents"], automation: ["Automatización","Automation"],
  marketing: ["Marketing","Marketing"], brand: ["Marca","Branding"],
  creative: ["Contenido creativo","Creative production"],
};
const READY: Record<string, [string,string]> = {
  draft: ["Borrador · no verificado","Draft · unverified"],
  internal_ready: ["Preparado internamente","Internally prepared"],
  sellable: ["Aprobado para ofrecer","Approved to offer"],
  paused: ["Pausado","Paused"], retired: ["Retirado","Retired"],
};
const DEPT: Record<string, [string,string]> = {
  website: ["Website Designer","Website Designer"],
  ecommerce: ["E-commerce Designer","E-commerce Designer"],
  crm_creator: ["CRM Creator","CRM Creator"],
  receptionist: ["AI Receptionist","AI Receptionist"],
  marketing: ["Marketing Hub","Marketing Hub"],
  sales: ["Comercial / CRM","Sales / CRM"],
};
const BILLING: Record<string,[string,string]> = {
  one_time: ["Pago único","One-time"], monthly: ["Mensual","Monthly"], annual: ["Anual","Annual"],
};
const MSG: Record<string,[string,string]> = {
  created: ["Servicio guardado como borrador y oculto en Ventas.","Service saved as a draft and hidden from Sales."],
  saved: ["Ficha de servicio actualizada.","Service details updated."],
  availability: ["Disponibilidad comercial actualizada.","Sales availability updated."],
  duplicate: ["Ese código de servicio ya existe.","That service code already exists."],
  conflict: ["Otro cambio modificó esta ficha. Actualiza la pantalla e inténtalo de nuevo.","Another edit changed this record. Refresh and try again."],
  schema_pending: ["Falta la migración Service Factory en esta base de datos.","Service Factory migration is missing from this database."],
  not_ready: ["Primero revisa el servicio y cambia su estado a Aprobado para ofrecer.","Review this service and mark it Approved to offer first."],
  forbidden: ["No tienes permiso para cambiar el catálogo.","You are not allowed to change the catalog."],
  required: ["Completa los campos obligatorios.","Please fill required fields."],
  invalid_code: ["El código debe comenzar con una letra minúscula y contener solo letras, números o guiones.","Code must start with a lowercase letter and use only letters, numbers and dashes."],
  invalid_amount: ["Revisa los importes: usa montos positivos con hasta dos decimales.","Check the amounts: use nonnegative values with at most two decimals."],
  invalid_template: ["Revisa la plantilla JSON de tareas y sus campos.","Check the task-template JSON and its fields."],
  invalid_checklist: ["Revisa el checklist de calidad (máximo 25 líneas).","Check the QA checklist (maximum 25 lines)."],
  invalid_revision: ["La versión de plantilla debe ser un entero positivo.","Template revision must be a positive integer."],
  too_long: ["Uno de los campos excede el límite permitido.","One of the fields exceeds its limit."],
  invalid_text: ["Se detectaron caracteres de control no permitidos.","Disallowed control characters detected."],
  invalid_choice: ["Selecciona una opción válida.","Choose a valid option."],
  unavailable: ["No se pudo guardar. Revisa la conexión y vuelve a intentar.","Unable to save. Check the connection and retry."],
  invalid: ["Datos inválidos.","Invalid input."],
};

const labelFor = (lang: Lang, pair?: [string,string]) => {
  const value = pair ?? ["Sin clasificar","Unclassified"];
  return pick(lang, value[0], value[1]);
};

function ServiceEditor({lang,row}:{lang:Lang;row?:ServiceRow}) {
  const existing = !!row;
  const input = (key:keyof ServiceRow, fallback="") => String(row?.[key] ?? fallback);
  const qa = Array.isArray(row?.qa_checklist) ? row.qa_checklist.join("\n") : "";
  const tasks = JSON.stringify(row?.task_template ?? [], null, 2);
  return <form action={saveCatalogService} className={s.form}>
    {row && <><input type="hidden" name="id" value={row.id}/><input type="hidden" name="version" value={row.version}/></>}
    <div className={s.row}>
      <label className={s.field}>{pick(lang,"Código estable (no cambia)","Stable code (immutable)")}
        <input name="code" defaultValue={input("code")} required maxLength={50} pattern="[a-z][a-z0-9-]+" readOnly={existing} placeholder="brand-identity"/></label>
      <label className={s.field}>{pick(lang,"Servicio (español)","Service (Spanish)")}
        <input name="name" defaultValue={input("name")} required maxLength={120} placeholder="Identidad de marca"/></label>
      <label className={s.field}>{pick(lang,"Servicio (inglés)","Service (English)")}
        <input name="name_en" defaultValue={input("name_en")} maxLength={120} placeholder="Brand identity"/></label>
    </div>
    <div className={s.row}>
      <label className={s.field}>{pick(lang,"Familia de servicio","Service family")}
        <select name="family" defaultValue={input("family","general")}>{SERVICE_FAMILIES.map(f=><option key={f} value={f}>{labelFor(lang,FAMILY[f])}</option>)}</select></label>
      <label className={s.field}>{pick(lang,"Departamento responsable","Responsible department")}
        <select name="department_id" defaultValue={input("department_id","marketing")}>{SERVICE_DEPARTMENTS.map(f=><option key={f} value={f}>{labelFor(lang,DEPT[f])}</option>)}</select></label>
      <label className={s.field}>{pick(lang,"Estado de preparación","Readiness")}
        <select name="readiness" defaultValue={input("readiness","draft")}>{SERVICE_READINESS.map(f=><option key={f} value={f}>{labelFor(lang,READY[f])}</option>)}</select></label>
    </div>
    <div className={s.row}>
      <label className={s.field}>{pick(lang,"Facturación","Billing")}
        <select name="billing_type" defaultValue={input("billing_type","one_time")}>{SERVICE_BILLING.map(f=><option key={f} value={f}>{labelFor(lang,BILLING[f])}</option>)}</select></label>
      <label className={s.field}>{pick(lang,"Precio sugerido (moneda a confirmar)","Suggested price (currency to confirm)")}
        <input name="suggested_price" inputMode="decimal" defaultValue={input("suggested_price")} placeholder="1200.00"/></label>
      <label className={s.field}>{pick(lang,"Costo directo externo estimado","Estimated external direct cost")}
        <input name="estimated_cost" inputMode="decimal" defaultValue={input("estimated_cost")} placeholder="180.00"/></label>
      <label className={s.field}>{pick(lang,"Horas humanas estimadas","Estimated labor hours")}
        <input name="estimated_hours" inputMode="decimal" defaultValue={input("estimated_hours")} placeholder="24"/></label>
    </div>
    <label className={s.field}>{pick(lang,"Alcance y entregables","Scope and deliverables")}
      <textarea name="deliverables" defaultValue={input("deliverables")} maxLength={4000} rows={3}/></label>
    <div className={s.row}>
      <label className={s.field}>{pick(lang,"Requisitos del cliente","Customer prerequisites")}
        <textarea name="requirements" defaultValue={input("requirements")} maxLength={4000} rows={3}/></label>
      <label className={s.field}>{pick(lang,"Exclusiones del alcance","Scope exclusions")}
        <textarea name="exclusions" defaultValue={input("exclusions")} maxLength={4000} rows={3}/></label>
    </div>
    <label className={s.field}>{pick(lang,"Checklist de calidad (una verificación por línea)","Quality checklist (one check per line)")}
      <textarea name="qa_checklist" defaultValue={qa} maxLength={7000} rows={3} placeholder={pick(lang,"Responsive\nFormularios\nAccesibilidad","Responsive\nForms\nAccessibility")}/></label>
    <div className={s.row}>
      <label className={s.field}>{pick(lang,"Plantilla de tareas (JSON, 25 máximo)","Task template (JSON, max 25)")}
        <textarea name="task_template" defaultValue={tasks} maxLength={32768} rows={5} spellCheck={false}/></label>
      <label className={s.field}>{pick(lang,"Revisión de plantilla","Template revision")}
        <input name="template_revision" type="number" min={1} max={999999} step={1} defaultValue={input("template_revision","1")} required/>
        <span className={s.muted}>{pick(lang,"Los cambios afectan órdenes futuras, no tareas históricas.","Changes apply to future orders, not historical tasks.")}</span></label>
    </div>
    <div className={s.actions}>
      <button className={`${s.button} ${s.primary}`} type="submit">{existing ? pick(lang,"Guardar ficha","Save service") : pick(lang,"Crear borrador","Create draft")}</button>
      <span className={s.muted}>{pick(lang,"Solo propietarios · cambios auditados","Owners only · audited changes")}</span>
    </div>
  </form>;
}

export default async function ServiceFactoryPage({searchParams}:{searchParams:Promise<Query>}) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const params = await searchParams;
  const catalog = await run<ServiceRow[]>(supabase.from("crm_service_catalog")
    .select("id,code,name,name_en,department_id,billing_type,suggested_price,family,readiness,active,deliverables,requirements,exclusions,estimated_hours,estimated_cost,qa_checklist,task_template,template_revision,version,crm_departments(label)")
    .order("department_id").order("name").limit(150));
  const items = catalog.data ?? [];
  const feedback = q(params, "ok"), failure = q(params,"error");
  const readinessCount = items.filter(x=>x.readiness === "sellable").length;
  const legacy = items.filter(x=>x.active && x.readiness !== "sellable").length;
  return <Suite active="service-factory"><div className={s.hud}>
    <OpsHeader lang={lang} active="factory" crm="sales" eyebrow="AVALON / SERVICE FACTORY"
      title={pick(lang,"Fábrica de servicios","Service Factory")}
      lead={pick(lang,"Prepara productos vendibles con alcance, costos, tareas y controles verificables. Esta pantalla es interna: no crea una página pública ni activa integraciones de IA.", "Prepare sellable offers with scope, cost estimates, tasks and verifiable checks. This is internal: it does not publish a website or activate AI providers.")}
      actions={<>
        <Link className={`${s.button} ${s.primary}`} href="/admin/service-factory/planner">{pick(lang,"Planificar solución","Plan a solution")}</Link>
        <Link className={s.button} href="/admin/workspace/crm/sales/new">{pick(lang,"Registrar venta","Record sale")}</Link>
      </>}/>
    {feedback && MSG[feedback] && <p className={s.flash} data-tone="ok" role="status">{labelFor(lang,MSG[feedback])}</p>}
    {failure && <p className={s.flash} data-tone="error" role="alert">{labelFor(lang,MSG[failure] ?? MSG.unavailable)}</p>}
    {catalog.error ? <Unavailable lang={lang} code={catalog.error}/> : <>
      <section className={s.stats} aria-label={pick(lang,"Estado del catálogo","Catalog status")}>
        <div className={s.stat}><span>{pick(lang,"Servicios mostrados","Services shown")}</span><strong>{items.length}</strong><small>{pick(lang,"Máximo 150 registros cargados","Maximum 150 loaded records")}</small></div>
        <div className={s.stat}><span>{pick(lang,"Aprobados para ofrecer","Approved to offer")}</span><strong>{readinessCount}</strong></div>
        <div className={s.stat}><span>{pick(lang,"Activos históricos por revisar","Active legacy services to review")}</span><strong>{legacy}</strong><small>{pick(lang,"No se desactivan automáticamente","Not automatically deactivated")}</small></div>
        <div className={s.stat}><span>{pick(lang,"Integraciones externas","External integrations")}</span><strong>—</strong><small>{pick(lang,"Sin verificar en esta pantalla","Not verified on this screen")}</small></div>
      </section>
      {legacy > 0 && <p className={s.flash} data-tone="warn" role="status">{pick(lang,
        "Los servicios heredados permanecen disponibles en Ventas para no interrumpir la operación, pero no han sido certificados como listos para ofrecer. Revísalos uno por uno.",
        "Existing services remain available in Sales to avoid interruption, but have not been certified as ready to offer. Review them individually.")}</p>}
      <section className={s.panel}>
        <header><h2>{pick(lang,"Nuevo servicio","New service")}</h2><span className={s.muted}>{pick(lang,"Se crea desactivado hasta aprobación explícita.","Created inactive until explicit approval.")}</span></header>
        <details><summary className={s.button}>{pick(lang,"+ Preparar nuevo servicio","+ Prepare new service")}</summary>
          <div style={{marginTop:16}}><ServiceEditor lang={lang}/></div>
        </details>
      </section>
      <section className={s.panel}>
        <header><h2>{pick(lang,"Catálogo existente","Existing catalog")}</h2><span className={s.muted}>{pick(lang,"Editar no modifica ventas ni tareas anteriores.","Editing does not rewrite past sales or tasks.")}</span></header>
        {items.length === 0 ? <p className={s.empty}>{pick(lang,"El catálogo está vacío. Prepara el primer servicio.","The catalog is empty. Prepare the first service.")}</p> :
          <div className={s.grid}>{items.map(service => <article key={service.id} className={s.panel}>
            <header><h2 style={{margin:0}}>{lang === "en" ? (service.name_en || service.name) : service.name}</h2>
              <span className={s.tag} data-tone={service.active?"ok":"neutral"}>{service.active?pick(lang,"En Ventas","In Sales"):pick(lang,"Fuera de Ventas","Not in Sales")}</span></header>
            <p className={s.muted}>{service.code} · {labelFor(lang,FAMILY[service.family])} · {labelFor(lang,DEPT[service.department_id])}</p>
            <p className={s.muted}>{labelFor(lang,READY[service.readiness])} · {labelFor(lang,BILLING[service.billing_type])}</p>
            <p>{service.deliverables || pick(lang,"Sin alcance registrado","No scope recorded")}</p>
            <p className={s.muted}>{pick(lang,"Precio sugerido","Suggested price")}: {service.suggested_price ?? "—"} · {pick(lang,"Costo directo estimado","Estimated direct cost")}: {service.estimated_cost ?? "—"} · {pick(lang,"Horas estimadas","Estimated hours")}: {service.estimated_hours ?? "—"}</p>
            <div className={s.actions}>
              <details><summary className={s.button}>{pick(lang,"Editar y revisar","Edit and review")}</summary>
                <div style={{marginTop:14}}><ServiceEditor lang={lang} row={service}/></div>
              </details>
              <form action={setCatalogAvailability} className={s.inline}>
                <input type="hidden" name="id" value={service.id}/><input type="hidden" name="version" value={service.version}/>
                <input type="hidden" name="enabled" value={service.active?"no":"yes"}/>
                <button type="submit" className={s.button} disabled={!service.active && service.readiness !== "sellable"}>
                  {service.active ? pick(lang,"Pausar en Ventas","Disable in Sales") : pick(lang,"Activar en Ventas","Enable in Sales")}
                </button>
              </form>
            </div>
          </article>)}</div>}
      </section>
      <p className={s.muted}>{pick(lang,
        "Un estado «Aprobado para ofrecer» significa revisión interna, no que proveedores externos estén conectados. El margen real requiere tarifa de mano de obra, costos confirmados y datos cobrados.",
        "Approved to offer means internal review, not that external providers are connected. Actual margin requires labor rates, confirmed costs and collected revenue.")}</p>
    </>}
  </div></Suite>;
}
