import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { UUID_RE } from "@/components/sales/ui";
import { AGREEMENT_VERSION, SERVICE_OPTIONS } from "@/lib/contracts/agreement";
import { createClientAgreement } from "./actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
type Client = { id:string;legal_name:string; location:string;country:string;origin_lead_id:string|null };
type Draft = {id:string;template_version:string;created_at:string;created_by:string;status:string};
type CommercialTerms = {billing_model:string|null; commission_pct:number|null; commission_base:string|null;
  commission_approved_by:string|null; attribution_rules:string; cancellation_terms:string; special_conditions:string;
  setup_price:number|null; monthly_fee:number|null; client_ad_budget:number|null; reconciliation:string|null;
  duration_months:number|null; start_date:string|null; currency:string};
const fields = [
  ["agencyName","Legal name of the real contracting individual(s) or registered entity","Nombre legal real de la(s) persona(s) firmante(s) o entidad registrada", "text", ""],
  ["agencyBrand","Brand/project name (not a legal entity) - optional","Nombre comercial o del proyecto (no es entidad legal) - opcional","text","Avalon Core Agency"],
  ["agencyAddress","Agency legal address","Dirección legal de Avalon","text",""],
  ["agencyEmail","Agency notices email","Correo legal de Avalon","email",""],
  ["clientAddress","Client registered address","Dirección registrada del cliente","text",""],
  ["clientEmail","Client notices email","Correo de notificaciones del cliente","email",""],
  ["county","Florida governing county","Condado de Florida","text",""],
  ["scope","Specific services included","Servicios específicos incluidos","textarea",""],
  ["exclusions","Excluded work","Trabajo excluido","textarea",""],
  ["deliverables","Deliverables and handover format","Entregables y forma de entrega","textarea",""],
  ["milestones","Milestones and client dependencies","Etapas y dependencias del cliente","textarea",""],
  ["acceptance","Acceptance criteria","Criterios de aceptación","textarea",""],
  ["revisions","Included revision rounds and limits","Revisiones incluidas y límites","text",""],
  ["term","Initial term, cancellation and renewal details","Plazo inicial, cancelación y renovación","text",""],
  ["paymentSchedule","Payment schedule / invoice due dates","Calendario de pagos y vencimientos","textarea","Net 15; define deposit and milestones in writing."],
  ["adSpend","Third-party advertising / platform budgets","Presupuesto y gastos de terceros","textarea","Paid directly by client unless a signed budget authorizes otherwise."],
  ["commission","Commission rate, revenue base and trigger (or None)","Comisión, base de cálculo y cuándo se gana (o Ninguna)","textarea","None."],
  ["specialTerms","Additional mutually approved conditions","Condiciones adicionales aprobadas","textarea",""],
] as const;
const name=(lang:"es"|"en",es:string,en:string)=>pick(lang,es,en);

export default async function ClientContracts({params, searchParams}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{ok?:string;error?:string;agreement?:string;page?:string}>;
}){
  const {id}=await params; if(!UUID_RE.test(id))notFound();
  const {supabase}=await requireOwner();
  const lang=await getLang();
  const p=await searchParams;
  const requestedPage = typeof p.page === "string" && /^[1-9]\d{0,3}$/.test(p.page) ? Number(p.page) : 1;
  const page = Math.min(500, requestedPage);
  const PAGE_SIZE = 20;
  const [clientResult,draftsResult]=await Promise.all([
    supabase.from("crm_clients").select("id,legal_name,location,country,origin_lead_id").eq("id",id).maybeSingle(),
    supabase.from("crm_client_agreement_drafts").select("id,template_version,created_at,created_by,status",{count:"exact"})
      .eq("client_id",id).order("created_at",{ascending:false}).order("id",{ascending:false})
      .range((page-1)*PAGE_SIZE,page*PAGE_SIZE-1),
  ]);
  const client=clientResult.data as Client|null; if(!client)notFound();
  const drafts=(draftsResult.data??[]) as Draft[];
  const leadId = client.origin_lead_id;
  const [termsResult, contactResult] = await Promise.all([
    leadId ? supabase.from("crm_commercial_terms")
      .select("billing_model,commission_pct,commission_base,commission_approved_by,attribution_rules,cancellation_terms,special_conditions,setup_price,monthly_fee,client_ad_budget,reconciliation,duration_months,start_date,currency")
      .eq("lead_id",leadId).eq("kind","agreed").maybeSingle() : Promise.resolve({data:null,error:null}),
    supabase.from("crm_contacts").select("email").eq("client_id",id).eq("is_primary",true).limit(1).maybeSingle(),
  ]);
  const terms = !termsResult.error ? termsResult.data as CommercialTerms|null : null;
  const hasApprovedCommission = !!terms?.commission_approved_by && (terms.billing_model==="commission" || terms.billing_model==="hybrid")
    && terms.commission_pct!==null;
  const baseLabel = terms?.commission_base==="gross_profit" ? "gross profit" :
    terms?.commission_base==="gross_revenue" ? "gross revenue" : "other written basis";
  const commissionDescription = hasApprovedCommission
    ? `${terms!.commission_pct}% of ${baseLabel}. Attribution: ${terms!.attribution_rules || "NOT AGREED — complete before signing"}. Refunds/cancellations: ${terms!.cancellation_terms || "NOT AGREED — complete before signing"}. Reconciliation: ${terms!.reconciliation || "NOT AGREED"}.`
    : "None. If a commission is negotiated, define its percentage, eligible collected revenue, attribution evidence, refunds, and settlement schedule before signing.";
  const signedTermsDescription = terms?.special_conditions || "";
  const price = (value:number|null|undefined) => value === null || value === undefined ? "0.00" : Number(value).toFixed(2);
  const selectedAgreement = typeof p.agreement === "string" && UUID_RE.test(p.agreement)
    ? drafts.find(d => d.id === p.agreement) : undefined;
  const path="/admin/workspace/crm/clients/"+id;
  return <Suite active="crm"><main className={s.hud}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>AVALON / CONTRACT STUDIO</p>
        <h1>{name(lang,"Contratos del cliente","Client agreements")}</h1>
        <p className={s.lead}>{client.legal_name} · {AGREEMENT_VERSION}</p>
      </div>
      <div className={s.actions}><Link className={s.button} href={path}>{name(lang,"Volver a Cliente 360°","Back to Client 360°")}</Link></div>
    </header>
    <section className={s.panel} aria-label="Legal review notice">
      <p className={s.muted}><strong>{name(lang,"BORRADOR LEGAL — REVISIÓN OBLIGATORIA","LEGAL DRAFT — REVIEW REQUIRED")}</strong>
      {" · "}{name(lang,"Crear o descargar un PDF no significa que esté firmado ni que la venta esté autorizada. Las cláusulas y los datos legales requieren revisión de abogado antes del uso con clientes.",
      "Generating or downloading a PDF is not a signature or approval. A Florida attorney must review the legal terms and business details before client use.")}</p>
    </section>
    {(p.ok==="created" || p.ok==="existing")&&<p className={s.flash} data-tone="ok" role="status">
      {p.ok==="existing"?name(lang,"Este borrador ya estaba guardado; no se creó un duplicado.","This exact draft already existed; no duplicate was created."):
      name(lang,"Borrador guardado. Revísalo antes de descargarlo.","Draft saved. Review it before downloading.")}
    </p>}
    {p.error&&<p className={s.flash} data-tone="error" role="alert">{p.error==="schema"
      ? name(lang,"La tabla de contratos todavía no está instalada en este entorno.","Contract drafts table is not installed in this environment.")
      : name(lang,"No se pudo guardar. Revisa todos los campos y vuelve a intentarlo.","Could not save. Check all fields and try again.")}</p>}
    <section className={s.panel}>
      <header><h2>{name(lang,"Borradores guardados","Saved drafts")}</h2></header>
      {draftsResult.error?<p className={s.muted}>{name(lang,"El sistema de borradores todavía no está disponible.","Draft storage is not yet available.")}</p>
      :drafts.length===0?<p className={s.muted}>{name(lang,"Todavía no hay contratos generados para este cliente.","No agreements generated for this client yet.")}</p>
      :<div className={s.grid}>{drafts.map(d=><article key={d.id} className={s.card}>
        <strong>{name(lang,"Contrato maestro","Master Services Agreement")}</strong>
        <p className={s.muted}>{new Date(d.created_at).toLocaleDateString(lang==="es"?"es-US":"en-US")} · {d.template_version} · DRAFT</p>
        <Link className={s.button} href={path+"/contracts?agreement="+d.id+"#contract-preview"}>{name(lang,"Vista previa","Preview PDF")}</Link>
      </article>)}</div>}
      {!draftsResult.error && (draftsResult.count??0)>PAGE_SIZE && <nav className={s.actions} aria-label={name(lang,"Páginas de contratos","Agreement pages")}>
        {page>1 && <Link className={s.button} href={path+"/contracts?page="+(page-1)}>{name(lang,"Anterior","Previous")}</Link>}
        <span className={s.muted}>{name(lang,"Página","Page")} {page} · {draftsResult.count} {name(lang,"borradores","drafts")}</span>
        {page*PAGE_SIZE<(draftsResult.count??0) && <Link className={s.button} href={path+"/contracts?page="+(page+1)}>{name(lang,"Siguiente","Next")}</Link>}
      </nav>}
    </section>
    {selectedAgreement && <section className={s.panel} id="contract-preview" aria-labelledby="contract-preview-title">
      <header><h2 id="contract-preview-title">{name(lang,"Vista previa del contrato","Agreement preview")}</h2></header>
      <p className={s.muted}>{client.legal_name} · {selectedAgreement.template_version} · {name(lang,"Borrador sin firmar. Revísalo completo antes de descargar.","Unsigned draft. Review every page before downloading.")}</p>
      <iframe title={name(lang,"PDF de contrato para revisar","Agreement PDF preview")} src={path+"/contracts/"+selectedAgreement.id+"?view=inline"}
        style={{width:"100%",height:"min(75vh, 800px)",minHeight:420,border:"1px solid #314064",borderRadius:12,background:"#fff"}} />
      <div className={s.actions}>
        <a className={s.button+" "+s.primary} href={path+"/contracts/"+selectedAgreement.id}>{name(lang,"Descargar PDF revisado","Download reviewed PDF")}</a>
        <a className={s.button} href={path+"/contracts/"+selectedAgreement.id+"?view=inline"} target="_blank" rel="noopener noreferrer">
          {name(lang,"Abrir vista previa en otra pestaña","Open preview in a new tab")}</a>
        <a className={s.button} href="#new-contract">{name(lang,"Crear otra versión para corregir","Create a corrected version")}</a>
      </div>
      <p className={s.muted}>{name(lang,"Esta vista previa y la descarga se generan desde el MISMO borrador inmutable. Ninguna acción aquí equivale a firma o aprobación legal.","Preview and download use the SAME immutable draft. Neither action is a signature or legal approval.")}</p>
    </section>}
    <section className={s.panel} id="new-contract">
      <header><h2>{name(lang,"Generar nuevo contrato","Generate new agreement")}</h2></header>
      <p className={s.muted}>{name(lang,"Se genera una versión inmutable. Para corregirla, crea otro borrador. Todos los campos de términos comerciales se incorporan al Anexo A.","Every saved draft is immutable. To correct it, create a new one. All commercial details appear in Exhibit A.")}</p>
      <form action={createClientAgreement} className={s.form}>
        <input type="hidden" name="client_id" value={id}/>
        {terms && <p className={s.flash} data-tone={hasApprovedCommission ? "ok" : "warn"}>
          {name(lang,"Datos comerciales acordados importados desde el lead. Confirma todos los términos antes de crear el borrador.",
            "Agreed commercial terms imported from the lead. Review every term before creating a draft.")}
          {" "}{name(lang,"Modelo:", "Model:")} {terms.billing_model || "—"}
          {terms.commission_pct!==null && !hasApprovedCommission &&
            " · "+name(lang,"Comisión no aprobada; no se incorpora automáticamente.","Commission not approved; not automatically imported.")}
        </p>}
        {!terms && <p className={s.muted}>{name(lang,"Sin condiciones comerciales acordadas. Completa manualmente los honorarios y la comisión, si aplica.",
          "No agreed commercial terms. Enter payment and commission details manually if applicable.")}</p>}
        <div className={s.fieldset}>
          <h3>{name(lang,"Identidad y notificaciones","Entities and notices")}</h3>
          <p className={s.muted}><strong>{name(lang,"Cliente guardado en CRM (verifica el nombre legal)","Client recorded in CRM (verify legal name)")}:</strong> {client.legal_name}</p>
          <p className={s.flash} data-tone="warn">
            {name(lang,
              "Avalon Core Agency todavía no está constituida: NO la introduzcas como LLC o empresa registrada. Escribe los nombres legales reales de quien(es) contratan. Usar un nombre comercial en Florida puede requerir registro como fictitious name (DBA) antes de operar.",
              "Avalon Core Agency is not yet formed: do NOT identify it as an LLC or registered company. Use the actual legal name(s) of the contracting person(s). Doing business under a separate trade name in Florida may require fictitious-name registration before operating.")}
          </p>
          <label className={s.field}>{name(lang,"Forma legal REAL del proveedor","ACTUAL legal form of service provider")}
            <select name="agencyLegalForm" defaultValue="" required>
              <option value="" disabled>{name(lang,"Selecciona la situación verdadera","Select the truthful status")}</option>
              <option value="individual">{name(lang,"Una persona natural (sin entidad constituida)","One individual (no formed entity)")}</option>
              <option value="joint_individuals">{name(lang,"Dos personas naturales, ambas firmarán","Two natural persons; both will sign")}</option>
              <option value="registered_entity">{name(lang,"Entidad legal registrada y verificable","Registered and verifiable legal entity")}</option>
            </select>
          </label>
          <label className={s.muted}>
            <input name="entityExistsConfirm" type="checkbox" value="yes"/>{" "}
            {name(lang,"Solo si eliges entidad registrada: confirmo que existe legalmente y que verificaré su registro antes de firmar.",
              "Only if registered entity is selected: I confirm it legally exists and will verify its registration before signing.")}
          </label>
          <label className={s.field}>{name(lang,"Fecha de vigencia","Effective date")}
            <input name="effectiveDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/>
          </label>
          {fields.slice(0,7).map(([key,en,es,kind,def])=><label className={s.field} key={key}>{name(lang,es,en)}
            <input name={key} type={kind} defaultValue={key==="clientAddress"?(client.location||"")+(client.country?", "+client.country:""):
              key==="clientEmail" ? (contactResult.data?.email || "") : def} required={key!=="agencyBrand"} maxLength={800}/>
          </label>)}
        </div>
        <fieldset className={s.fieldset}>
          <legend>{name(lang,"Servicios contratados","Contracted service categories")}</legend>
          <div className={s.grid}>{SERVICE_OPTIONS.map(service=><label key={service} className={s.muted}>
            <input type="checkbox" name="services" value={service}/> {" "}{service}
          </label>)}</div>
        </fieldset>
        <fieldset className={s.fieldset}>
          <legend>{name(lang,"Alcance y protección comercial","Scope and commercial safeguards")}</legend>
          {fields.slice(7).map(([key,en,es,kind,def])=><label className={s.field} key={key}>{name(lang,es,en)}
            {kind==="textarea"?<textarea name={key} rows={3} defaultValue={key==="commission" ? commissionDescription :
                key==="adSpend" && terms?.client_ad_budget!==null && terms?.client_ad_budget!==undefined
                  ? "Client advertising spend: USD "+price(terms.client_ad_budget)+". Paid by client unless separately authorized." :
                key==="term" && terms?.duration_months
                  ? "Initial term: "+terms.duration_months+" months. Start date: "+(terms.start_date || "to be agreed")+". Renewal/cancellation subject to signed terms." :
                key==="specialTerms" ? signedTermsDescription : def} required={key!=="exclusions"&&key!=="specialTerms"} maxLength={3000}/>
              :<input name={key} type="text" defaultValue={def} required maxLength={800}/>}
          </label>)}
          <label className={s.field}>{name(lang,"Costo de instalación (USD)","One-time setup fee (USD)")}
            <input name="setupFee" type="number" min="0" step="0.01" defaultValue={price(terms?.setup_price)} required/>
          </label>
          <label className={s.field}>{name(lang,"Honorarios mensuales (USD)","Monthly retainer (USD)")}
            <input name="monthlyFee" type="number" min="0" step="0.01" defaultValue={price(terms?.monthly_fee)} required/>
          </label>
        </fieldset>
        <div className={s.actions}><button type="submit" className={s.button+" "+s.primary}>
          {name(lang,"Guardar y ver vista previa","Save and preview PDF")}</button></div>
      </form>
    </section>
  </main></Suite>;
}
