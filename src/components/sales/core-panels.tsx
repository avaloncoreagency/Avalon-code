import { personDisplayName, directoryDisplayName, authorDisplayName } from "@/lib/identity/owners";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadClientLedger, loadSaleOperations } from "@/lib/sales/core-engine-server";
import { coreEngineMessage, type ClientLedger, type CatalogOffer } from "@/lib/sales/core-engine";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { money } from "@/lib/sales/domain";
import { operateSale, editCatalogOffer } from "@/app/admin/workspace/crm/core-actions";
import { CoreForm } from "./core-form";
import s from "./sales.module.css";

const STATUS: Record<string,[string,string]> = {issued:["Emitida","Issued"],void:["Anulada","Void"],recorded:["Registrado (sin verificar)","Recorded (unverified)"],verified:["Verificado","Verified"],reversed:["Revertido","Reversed"],agreed:["Acordada","Agreed"],accrued:["Devengada","Accrued"],paid:["Pagada","Paid"],cancelled:["Cancelada","Cancelled"]};
const status = (lang: Lang,key: string) => STATUS[key] ? pick(lang,...STATUS[key]) : key;
export function LedgerPanel({ledger,lang}:{ledger:ClientLedger;lang:Lang}) {
  const labels: [keyof ClientLedger["currencies"][number],string,string][] = [
    ["contracted","Contratado","Contracted"],["invoiced","Facturado","Invoiced"],["collected","Cobrado registrado","Recorded collections"],["collected_verified","Cobrado verificado","Verified collections"],["expenses","Gastos","Expenses"],["commissions_agreed","Comisiones acordadas","Agreed commissions"],["commissions_accrued","Comisiones devengadas","Accrued commissions"],["commissions_paid","Comisiones pagadas","Paid commissions"],["profit","Saldo registrado (no es beneficio neto)","Recorded balance (not net profit)"],["outstanding","Pendiente","Outstanding"]];
  return <section className={s.panel} aria-label={pick(lang,"Libro financiero del cliente","Client financial ledger")}>
    <h2>{pick(lang,"Libro financiero completo","Complete financial ledger")}</h2>
    <p className={s.muted}>{pick(lang,"Agregado del servidor por moneda. Saldo registrado = cobrado registrado − gastos − comisiones pagadas; incluye cobros sin verificar y no equivale a beneficio neto ni a flujo de caja.","Server aggregate per currency. Recorded balance = recorded collections − expenses − paid commissions; it includes unverified collections and is not net profit or cash flow.")} · {formatDate(lang,ledger.as_of,true)}</p>
    {ledger.currencies.length === 0 ? <p>{pick(lang,"Sin movimientos registrados.","No recorded transactions.")}</p> : ledger.currencies.map(row=><section key={row.currency} aria-label={row.currency}><h3>{row.currency}</h3><dl className={s.detail}>{labels.map(([key,es,en])=><div key={key}><dt>{pick(lang,es,en)}</dt><dd>{money(lang,row[key],row.currency)}</dd></div>)}</dl></section>)}
  </section>;
}

export async function SaleCorePanels({db,saleId,clientId,lang,currency,owners}:{db:SupabaseClient;saleId:string;clientId:string;lang:Lang;currency:string;owners:{user_id:string;email:string}[]}) {
  const capability = await loadClientLedger(db,clientId);
  const t=(es:string,en:string)=>pick(lang,es,en);
  if (!capability.ok) return <section className={s.panel} aria-label="Core Engine"><h2>Core Engine</h2><p role="status">{"unavailable" in capability ? t("Facturas, conciliación y comisiones pendientes de activar en esta base.","Invoices, reconciliation and commissions are pending activation in this database.") : coreEngineMessage({message:capability.message},lang)}</p></section>;
  const data = await loadSaleOperations(db,saleId);
  if (!data.ok) return <p role="alert">{coreEngineMessage({message:data.message},lang)}</p>;
  const action = (operation:string)=>operateSale.bind(null,saleId,operation);
  const reason=(name="reason",min=5)=><label className={s.field}>{t("Motivo documentado","Documented reason")}<textarea name={name} required minLength={min} maxLength={500}/></label>;
  const bounded=(key:keyof typeof data.counts,n:number)=><p className={s.muted}>{t(`Mostrando ${n} de ${data.counts[key] ?? "—"}; el libro usa todos los registros.`,`Showing ${n} of ${data.counts[key] ?? "—"}; the ledger uses all records.`)}</p>;
  return <section aria-label={t("Operaciones financieras","Financial operations")} className={s.grid}>
    <section className={s.panel} aria-label={t("Facturas","Invoices")}><h2>{t("Facturas documentadas","Documented invoices")}</h2>
      <p className={s.muted}>{t("Registra una factura emitida fuera de Avalon; no se envía ni se cobra dinero.","Record an invoice issued outside Avalon; no invoice is sent and no money is charged.")}</p>
      <CoreForm lang={lang} action={action("invoice")} label={t("Registrar factura","Record invoice")}>
        <label className={s.field}>{t("Número de factura","Invoice number")}<input name="number" required maxLength={60}/></label>
        <label className={s.field}>{t("Importe","Amount")} ({currency})<input name="amount" required inputMode="decimal"/></label>
        <div className={s.row}><label className={s.field}>{t("Emisión","Issue date")}<input name="issued_on" type="date" required/></label><label className={s.field}>{t("Vencimiento","Due date")}<input name="due_on" type="date"/></label></div>
        <label className={s.field}>{t("Documento del mismo cliente (UUID opcional)","Document from the same client (optional UUID)")}<input name="attachment_id"/></label>
        <label className={s.field}>{t("Nota","Note")}<textarea name="note" maxLength={1000}/></label>
      </CoreForm>
      {bounded("invoices",data.invoices.length)}
      <ul className={s.list}>{data.invoices.map(x=><li key={x.id}><strong>{x.number} · {money(lang,x.amount,x.currency)}</strong><span>{status(lang,x.status)} · {formatDate(lang,x.issued_on)}{x.due_on ? ` → ${formatDate(lang,x.due_on)}` : ""}</span>
        <span className={s.inline} data-invoice-actions><a className={s.button} href={`/admin/workspace/crm/sales/${saleId}/invoices/${x.id}`}>{t("Ver factura","View invoice")}</a>
          <a className={s.button} href={`/admin/workspace/crm/sales/${saleId}/invoices/${x.id}/pdf`} download>{t("Descargar PDF","Download PDF")}</a>
          <a className={s.button} href={`/admin/workspace/crm/sales/${saleId}/invoices/${x.id}#print`}>{t("Imprimir","Print")}</a></span>
        {x.status === "issued" ? <CoreForm action={action("void")} lang={lang} label={t("Anular factura","Void invoice")} confirmText={t("¿Anular esta factura? El historial se conserva.","Void this invoice? History is retained.")}><input type="hidden" name="id" value={x.id}/>{reason()}</CoreForm>:<p>{x.void_reason}</p>}</li>)}</ul>
    </section>
    <section className={s.panel} aria-label={t("Conciliación de pagos","Payment reconciliation")}><h2>{t("Conciliación de pagos","Payment reconciliation")}</h2>
      <p className={s.muted}>{t("Un registro no equivale a un pago verificado. Usa referencias sin datos bancarios sensibles.","A recorded entry is not a verified payment. Use references without sensitive bank details.")}</p>
      {bounded("payments",data.payments.length)}
      <ul className={s.list}>{data.payments.map(x=><li key={x.id}><strong>{money(lang,x.amount,x.currency)} · {status(lang,x.status)}</strong><span>{x.reference} · {formatDate(lang,x.received_on)}</span>
        {x.status === "recorded" && <CoreForm action={action("verify")} lang={lang} label={t("Verificar pago","Verify payment")}><input type="hidden" name="id" value={x.id}/><label className={s.field}>{t("Referencia de evidencia","Evidence reference")}<input name="evidence" required minLength={3} maxLength={300}/></label></CoreForm>}
        {x.status !== "reversed" ? <CoreForm action={action("reverse")} lang={lang} label={t("Revertir pago","Reverse payment")} confirmText={t("¿Revertir el registro? No ejecuta una devolución bancaria.","Reverse this record? This does not issue a bank refund.")}><input type="hidden" name="id" value={x.id}/>{reason()}</CoreForm>:<p>{x.reversal_reason}</p>}
        {x.evidence && <p>{t("Evidencia","Evidence")}: {x.evidence}</p>}
      </li>)}</ul>
    </section>
    <section className={s.panel} aria-label={t("Comisiones","Commissions")}><h2>{t("Comisiones","Commissions")}</h2>
      <p className={s.muted}>{t("Solo acuerdos reales. Marcar pagada registra un pago externo ya realizado; no transfiere dinero.","Real agreements only. Marking paid records an external payment already made; it does not transfer money.")}</p>
      <CoreForm action={action("agree")} lang={lang} label={t("Acordar comisión","Agree commission")}>
        <label className={s.field}>{t("Tipo","Type")}<select name="kind"><option value="sale">{t("Venta","Sale")}</option><option value="referral">{t("Referido","Referral")}</option></select></label>
        <label className={s.field}>{t("Propietario beneficiario (o nombre externo)","Owner beneficiary (or external name)")}<select name="beneficiary_id"><option value="">{t("Referente externo","External referrer")}</option>{owners.map(o=><option key={o.user_id} value={o.user_id}>{personDisplayName(o)}</option>)}</select></label>
        <label className={s.field}>{t("Nombre externo (solo si no eliges propietario)","External name (only when no owner selected)")}<input name="beneficiary_name" maxLength={160}/></label>
        <div className={s.row}><label className={s.field}>{t("Porcentaje (o importe fijo)","Percentage (or fixed amount)")}<input name="rate_pct" inputMode="decimal"/></label><label className={s.field}>{t("Importe fijo (o porcentaje)","Fixed amount (or percentage)")}<input name="fixed_amount" inputMode="decimal"/></label></div>
        <label className={s.field}>{t("Acuerdo escrito / referencia","Written agreement / reference")}<textarea name="basis" required minLength={10} maxLength={2000}/></label>
      </CoreForm>
      {bounded("commissions",data.commissions.length)}
      <ul className={s.list}>{data.commissions.map(x=><li key={x.id}><strong>{x.beneficiary_id ? directoryDisplayName(owners,x.beneficiary_id,t("Miembro","Member")) : authorDisplayName(x.beneficiary_name,t("Miembro","Member"))} · {money(lang,x.amount,x.currency)}</strong><span>{status(lang,x.status)} · {x.basis}</span>
        {x.status === "agreed" && <CoreForm lang={lang} action={action("accrued")} label={t("Devengar comisión","Accrue commission")}><input type="hidden" name="id" value={x.id}/></CoreForm>}
        {x.status === "accrued" && <CoreForm lang={lang} action={action("paid")} label={t("Registrar comisión pagada","Record commission paid")} confirmText={t("¿Confirmar que el pago externo ya fue realizado?","Confirm that the external payment has already been made?")}><input type="hidden" name="id" value={x.id}/><label className={s.field}>{t("Referencia del pago externo","External payment reference")}<input name="note" required maxLength={120}/></label></CoreForm>}
        {["agreed","accrued"].includes(x.status) && <CoreForm lang={lang} action={action("cancelled")} label={t("Cancelar comisión","Cancel commission")} confirmText={t("¿Cancelar este acuerdo?","Cancel this agreement?")}><input type="hidden" name="id" value={x.id}/>{reason("note")}</CoreForm>}
        {x.paid_reference && <p>{x.paid_reference}</p>}{x.cancel_reason && <p>{x.cancel_reason}</p>}
      </li>)}</ul>
    </section>
  </section>;
}

export function OfferFields({offer,id,version,lang}:{offer:CatalogOffer;id:string;version:number;lang:Lang}) {
 const t=(es:string,en:string)=>pick(lang,es,en);
 return <details><summary>{t("Condiciones comerciales","Commercial offer")} · {offer.offer_status} · v{offer.offer_version}</summary>
   {offer.offer_approved_at && <p>{t("Aprobada","Approved")}: {formatDate(lang,offer.offer_approved_at,true)}</p>}
   <p className={s.muted}>{t("Editar una oferta aprobada crea una nueva versión en borrador. No hay precios ni comisiones predeterminados.","Editing an approved offer creates a new draft version. No prices or commissions are preset.")}</p>
   <CoreForm lang={lang} action={editCatalogOffer.bind(null,id,version,false)} label={t("Guardar condiciones","Save commercial terms")}>
    <div className={s.row}>{[["monthly_price","Precio mensual","Monthly price"],["direct_cost","Costo directo","Direct cost"],["target_margin_pct","Margen objetivo (%)","Target margin (%)"],["estimated_days","Duración (días)","Duration (days)"]].map(([key,es,en])=><label className={s.field} key={key}>{t(es,en)}<input name={key} defaultValue={String(offer[key as keyof CatalogOffer]??"")} inputMode="decimal"/></label>)}</div>
    {[["deliverables","Entregables","Deliverables"],["exclusions","Exclusiones","Exclusions"],["payment_terms","Condiciones de cobro","Payment terms"]].map(([key,es,en])=><label className={s.field} key={key}>{t(es,en)}<textarea name={key} maxLength={key==="payment_terms"?2000:4000} defaultValue={String(offer[key as keyof CatalogOffer]??"")}/></label>)}
    <label className={s.field}>{t("Regla de comisión","Commission rule")}<select name="commission_kind" defaultValue={offer.commission_kind}>{["none","sale_pct","referral_pct","fixed"].map(v=><option value={v} key={v}>{v}</option>)}</select></label>
    <label className={s.field}>{t("Valor de comisión (vacío para ninguna)","Commission value (empty for none)")}<input name="commission_value" defaultValue={offer.commission_value??""} inputMode="decimal"/></label>
   </CoreForm>
   {offer.offer_status !== "approved" && <CoreForm lang={lang} action={editCatalogOffer.bind(null,id,version,true)} label={t("Aprobar oferta","Approve offer")} confirmText={t("¿Aprobar estas condiciones y precio para uso comercial?","Approve these terms and price for commercial use?")}><p>{t("La aprobación queda atribuida a tu cuenta.","Approval is attributed to your account.")}</p></CoreForm>}
 </details>;
}
