import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getCrmCapabilities } from "@/lib/sales/client-finance-server";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { UUID_RE } from "@/components/sales/ui";
import { recordAttribution, transitionAttribution } from "./actions";
import { ATTRIBUTION_LABEL, attributionActions, isAttributionState } from "@/lib/sales/attribution";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
type Client = {id:string;legal_name:string;origin_lead_id:string|null};
type Terms = {id:string;billing_model:string|null;commission_pct:number|null;commission_base:string|null;
  commission_approved_by:string|null;updated_at:string;currency:string};
type Contract = {id:string;verified_at:string|null};
type Conversion = {id:string;source:string;external_ref:string;gross_collected:string;excluded_amount:string;
  rate_pct:string;commission_due:string;currency:string;status:string;created_at:string;
  verification_ref:string;settlement_ref:string;void_reason:string;version?:number;disputed_from?:string|null;
  client_payment_ref?:string;attribution_ref?:string;invoice_ref?:string;dispute_reason?:string};
type Summary = {currency:string;count:number;reported_count:number;eligible:string;paid:string;pending:string;
  unverified?:string;invoiced?:string;disputed?:string};
type SummaryPayload = {currencies:Summary[]};
const n = (v:number|string,currency="USD") =>
  new Intl.NumberFormat("en-US",{style:"currency",currency}).format(Number(v));

export default async function ClientResults({params,searchParams}:{
  params:Promise<{id:string}>;
  searchParams:Promise<{ok?:string;error?:string}>;
}) {
  const {id} = await params; if(!UUID_RE.test(id)) notFound();
  const {supabase} = await requireOwner();
  const lang = await getLang(), q = await searchParams;
  const clientResponse = await supabase.from("crm_clients")
    .select("id,legal_name,origin_lead_id").eq("id",id).maybeSingle();
  if (clientResponse.error || !clientResponse.data) notFound();
  const client = clientResponse.data as Client;
  const caps = await getCrmCapabilities(supabase);
  const path = "/admin/workspace/crm/clients/"+id;
  if (caps.source!=="database" || !caps.owner || !caps.financeView)
    return <Suite active="crm"><main className={s.hud}><section className={s.panel}>
      <h1>{pick(lang,"Resultados y comisiones","Results and commissions")}</h1>
      <p>{pick(lang,"Acceso financiero no verificado o no autorizado. Solicita al administrador habilitar tu acceso en la lista financiera; no se muestran cifras privadas.",
        "Finance access is unavailable or not authorized. Ask an administrator to enable finance access; no private amounts are shown.")}</p>
      <Link className={s.button} href={path}>{pick(lang,"Volver","Back")}</Link>
    </section></main></Suite>;

  const [termsResponse,rowsResponse,summaryResponse] = await Promise.all([
    client.origin_lead_id ? supabase.from("crm_commercial_terms")
      .select("id,billing_model,commission_pct,commission_base,commission_approved_by,updated_at,currency")
      .eq("lead_id",client.origin_lead_id).eq("kind","agreed").maybeSingle()
      : Promise.resolve({data:null,error:null}),
    supabase.from("crm_attributed_conversions")
      .select("*")
      .eq("client_id",id).order("created_at",{ascending:false}).limit(100),
    supabase.rpc("crm_attribution_summary",{p_client:id}),
  ]);
  const terms = termsResponse.error ? null : termsResponse.data as Terms|null;
  const signedResponse = terms && client.origin_lead_id
    ? await supabase.from("crm_contracts").select("id,verified_at")
      .eq("lead_id",client.origin_lead_id).eq("terms_id",terms.id)
      .eq("status","verified_signed").order("verified_at",{ascending:false}).limit(1).maybeSingle()
    : {data:null,error:null};
  const signed = signedResponse.data as Contract|null;
  const canRecord = !!terms && !!terms.commission_approved_by &&
    ["commission","hybrid"].includes(terms.billing_model||"") && terms.commission_base==="gross_revenue" &&
    Number(terms.commission_pct)>0 && !!signed?.verified_at &&
    Date.parse(terms.updated_at) <= Date.parse(signed.verified_at);
  const entries = (rowsResponse.data??[]) as Conversion[];
  const summary = !summaryResponse.error && summaryResponse.data &&
    typeof summaryResponse.data==="object" ? summaryResponse.data as SummaryPayload : null;
  const ledgerReady = !rowsResponse.error && !summaryResponse.error;
  return <Suite active="crm"><main className={s.hud}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>AVALON / REVENUE ATTRIBUTION</p>
        <h1>{pick(lang,"Resultados y comisiones por cobrar","Results and commissions receivable")}</h1>
        <p className={s.lead}>{client.legal_name}</p>
      </div>
      <Link className={s.button} href={path}>{pick(lang,"Volver a Clientes 360","Back to Client 360")}</Link>
    </header>
    <section className={s.panel}>
      <h2>{pick(lang,"Modelo comercial acordado","Agreed commercial model")}</h2>
      <p>{terms ? `${terms.billing_model||"—"} · ${terms.commission_pct??"—"}% · ${terms.commission_base||"—"} · ${terms.currency}` :
        pick(lang,"No hay condiciones acordadas en el lead de origen.","No agreed terms found on origin lead.")}</p>
      <p className={s.muted}>{pick(lang,
        "Las ventas del consumidor final NO son ingresos de Avalon. Solo la comisión verificada y pagada es ingreso cobrado. Este libro no es el registro de comisiones de vendedores.",
        "End-customer sales are NOT Avalon revenue. Only a verified and paid commission is cash collected by Avalon. This is not the sales-rep payout ledger.")}</p>
      {!canRecord && <p className={s.flash} data-tone="warn">{pick(lang,
        "Para registrar conversiones se requiere un contrato firmado y verificado que corresponda a términos comerciales aprobados, vigentes, con comisión sobre ingresos cobrados. Otros tipos de base requieren conciliación especializada.",
        "Recording requires a verified signed contract with current approved commercial terms and a collected-revenue commission. Other commission bases require specialized reconciliation.")}</p>}
    </section>
    {!ledgerReady ? <section className={s.panel}><p className={s.flash} data-tone="warn">
      {pick(lang,"Libro aún no disponible: la migración de conversiones debe validarse e instalarse antes de registrar datos.",
        "Ledger is not available: the conversions migration must be reviewed and installed before recording data.")}
    </p></section> : <>
      {summary && <section className={s.panel}>
        <h2>{pick(lang,"Resumen financiero verificable","Verified financial summary")}</h2>
        {!summary.currencies.length && <p className={s.muted}>{pick(lang,"No hay conversiones todavía.","No conversions yet.")}</p>}
        {summary.currencies.map(currency => <div key={currency.currency}>
          <p className={s.muted}>{currency.currency} · {pick(lang,"Moneda independiente","Separate currency")}</p>
          <div className={s.grid}>
            <div className={s.card}><span>{pick(lang,"Comisión elegible verificada","Verified eligible commission")}</span><strong>{n(currency.eligible,currency.currency)}</strong></div>
            <div className={s.card}><span>{pick(lang,"Cobrado por Avalon","Collected by Avalon")}</span><strong>{n(currency.paid,currency.currency)}</strong></div>
            <div className={s.card}><span>{pick(lang,"Pendiente de cobro","Awaiting settlement")}</span><strong>{n(currency.pending,currency.currency)}</strong></div>
            <div className={s.card}><span>{pick(lang,"Conversiones reportadas / total","Reported / total conversions")}</span><strong>{currency.reported_count} / {currency.count}</strong></div>
            {currency.unverified!==undefined && <div className={s.card}><span>{pick(lang,"Sin verificar (no exigible)","Unverified (not eligible)")}</span><strong>{n(currency.unverified,currency.currency)}</strong></div>}
            {currency.invoiced!==undefined && <div className={s.card}><span>{pick(lang,"Facturada, pendiente de cobro","Invoiced, not yet collected")}</span><strong>{n(currency.invoiced,currency.currency)}</strong></div>}
            {currency.disputed!==undefined && <div className={s.card}><span>{pick(lang,"En disputa (excluida)","Disputed (excluded)")}</span><strong>{n(currency.disputed,currency.currency)}</strong></div>}
          </div>
        </div>)}
      </section>}
      {q.ok && <p className={s.flash} data-tone="ok">{pick(lang,"Operación registrada; consulta la tabla para verificar el estado.","Operation saved; inspect the row status below.")}</p>}
      {q.error && <p className={s.flash} data-tone="error">{pick(lang,"La operación no se aplicó:", "Operation rejected:")} {q.error==="conflict" ? pick(lang,"otra persona cambió este registro; recarga y revisa antes de continuar.","someone else changed this record; reload and review before continuing.") : q.error==="schema_pending" ? pick(lang,"la migración del ciclo de comisiones (20261121181000) aún no está aplicada.","the commission lifecycle migration (20261121181000) is not applied yet.") : q.error}</p>}
      {canRecord && <section className={s.panel}>
        <h2>{pick(lang,"Registrar venta atribuida cobrada","Record paid, attributable end-customer sale")}</h2>
        <form action={recordAttribution} className={s.form}>
          <input type="hidden" name="client_id" value={id}/>
          <div className={s.row}>
            <label className={s.field}>{pick(lang,"Fuente verificable","Attribution source")}
              <input name="source" minLength={3} maxLength={120} placeholder="Campaign / referral / tracked booking" required/></label>
            <label className={s.field}>{pick(lang,"Referencia única de venta / cita","Unique sale / appointment reference")}
              <input name="external_ref" minLength={3} maxLength={160} required/></label>
            <label className={s.field}>{pick(lang,"Ingresos cobrados al consumidor","End-customer amount collected")}
              <input name="gross_collected" type="number" min="0.01" max="999999999999" step="0.01" required/></label>
            <label className={s.field}>{pick(lang,"Exclusiones acordadas (impuestos / devoluciones)","Contractual exclusions (taxes / refunds)")}
              <input name="excluded_amount" type="number" min="0" step="0.01" defaultValue="0.00" required/></label>
          </div>
          <p className={s.muted}>{pick(lang,"Quedará como Reportada. No se considera elegible hasta que verifiques cobro y atribución; no se considera pagada hasta registrar la transferencia a Avalon.",
            "Saved as Reported. Not eligible until payment and attribution are verified; not paid until settlement to Avalon is recorded.")}</p>
          <button className={s.button+" "+s.primary}>{pick(lang,"Registrar conversión","Record conversion")}</button>
        </form>
      </section>}
      <section className={s.panel}>
        <h2>{pick(lang,"Historial de conversiones (últimas 100)","Conversion history (latest 100)")}</h2>
        {!entries.length ? <p className={s.muted}>{pick(lang,"Sin conversiones registradas.","No conversions recorded.")}</p> :
          <div className={s.grid}>{entries.map(c=><article className={s.card} key={c.id}>
            <strong>{c.source} · {c.external_ref}</strong>
            <p>{isAttributionState(c.status) ? pick(lang,...ATTRIBUTION_LABEL[c.status]) : c.status} · {new Date(c.created_at).toLocaleDateString(lang==="es"?"es-US":"en-US")}</p>
            <p>{pick(lang,"Cobrado al negocio (no es ingreso de Avalon)","Collected by client business (not Avalon revenue)")}: {n(c.gross_collected,c.currency)} · {pick(lang,"Excluido","Excluded")}: {n(c.excluded_amount,c.currency)}</p>
            <p><strong>{pick(lang,"Comisión de Avalon","Avalon commission")}: {n(c.commission_due,c.currency)} ({c.rate_pct}%)</strong></p>
            {c.client_payment_ref && <p className={s.muted}>{pick(lang,"Cobro del cliente","Customer payment")}: {c.client_payment_ref}</p>}
            {c.attribution_ref && <p className={s.muted}>{pick(lang,"Atribución","Attribution")}: {c.attribution_ref}</p>}
            {c.verification_ref && <p className={s.muted}>{pick(lang,"Evidencia de verificación","Verification evidence")}: {c.verification_ref}</p>}
            {c.invoice_ref && <p className={s.muted}>{pick(lang,"Factura de Avalon","Avalon invoice")}: {c.invoice_ref}</p>}
            {c.settlement_ref && <p className={s.muted}>{pick(lang,"Referencia de pago a Avalon","Avalon settlement reference")}: {c.settlement_ref}</p>}
            {c.dispute_reason && c.status==="disputed" && <p className={s.muted}>{pick(lang,"Disputa","Dispute")}: {c.dispute_reason}</p>}
            {c.void_reason && <p className={s.muted}>{pick(lang,"Motivo de anulación","Void reason")}: {c.void_reason}</p>}
            {attributionActions(c.status,c.disputed_from).map(a=><form key={a.to} action={transitionAttribution} className={s.form}>
              <input type="hidden" name="client_id" value={id}/>
              <input type="hidden" name="conversion_id" value={c.id}/>
              <input type="hidden" name="version" value={String(c.version ?? 1)}/>
              <input type="hidden" name="target" value={a.to}/>
              <label className={s.field}>{pick(lang,...a.evidence)}
                <input name="evidence" minLength={a.to==="void"||a.to==="disputed"?5:3} maxLength={250} required/></label>
              <div className={s.actions}><button className={s.button+(a.tone==="primary"?" "+s.primary:"")}>{pick(lang,a.es,a.en)}</button></div>
            </form>)}
          </article>)}</div>}
      </section>
    </>}
  </main></Suite>;
}
