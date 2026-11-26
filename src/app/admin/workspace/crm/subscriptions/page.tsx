import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { subscriptionAction } from "./actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type Sub = { id: string; status: string; period: "monthly" | "annual"; amount: string; currency: string; renewal_mode: string; activated_on: string | null;
  current_period_start: string | null; current_period_end: string | null; cancel_at_period_end: boolean; ended_on: string | null; included_usage: string | null; usage_unit: string;
  sale_id: string; crm_service_catalog: { name: string; name_en: string } | null; crm_clients: { legal_name: string; trade_name: string } | null };
type Period = { id: string; subscription_id: string; seq: number; period_start: string; period_end: string; amount: string; invoice_id: string | null; usage: string };
type Line = { id: string; line_total: string; billing_type: string; sale_id: string; crm_sales: { sale_number: string; status: string; currency: string } | null; crm_service_catalog: { name: string } | null };
type Invoice = { id: string; number: string; sale_id: string; amount: string; currency: string };

const STATUS: Record<string, [string, string]> = {
  pending_activation: ["Pendiente de activar", "Pending activation"], active: ["Activa", "Active"], suspended: ["Suspendida", "Suspended"],
  cancelled: ["Cancelada", "Cancelled"], expired: ["Vencida", "Expired"],
};
const ERRORS: Record<string, [string, string]> = {
  invalid: ["Revisa los datos.", "Check the data."], failed: ["No se pudo completar.", "Could not complete."],
  crm_forbidden: ["Solo los propietarios operan suscripciones.", "Only owners operate subscriptions."],
  subscription_line_not_recurring: ["Esa línea no es mensual ni anual.", "That line is not monthly or annual."],
  subscription_sale_not_confirmed: ["La venta no está confirmada.", "The sale is not confirmed."],
  subscription_invalid_transition: ["Ese cambio no es posible en el estado actual (o el período indicado no es el vigente).", "That change is not possible in the current state (or the stated period is not the current one)."],
  subscription_reason_required: ["Escribe el motivo (mínimo 5 caracteres).", "Write the reason (at least 5 characters)."],
  subscription_period_invoiced: ["Ese período ya tiene factura.", "That period already has an invoice."],
  subscription_invoice_invalid: ["La factura debe estar emitida, ser de la misma venta y no estar vinculada a otro período.", "The invoice must be issued, belong to the same sale and not be linked to another period."],
  subscription_usage_invalid: ["Indica un consumo positivo.", "Enter a positive usage."],
};

/**
 * Sales Center → Subscriptions (AVL-CLAUDE-CONVERGENCE-001). OWNERS ONLY. Recurring products opened from confirmed
 * sales: activation, periods, renewals, suspension, reactivation, cancellation, usage and the canonical invoice of each
 * period. Amounts always come from the sale; this page never creates invoices, payments or commissions.
 */
export default async function Subscriptions({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang(); const p = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const [subsR, periodsR, linesR, invR] = await Promise.all([
    supabase.from("crm_subscriptions").select("id,status,period,amount,currency,renewal_mode,activated_on,current_period_start,current_period_end,cancel_at_period_end,ended_on,included_usage,usage_unit,sale_id,crm_service_catalog(name,name_en),crm_clients(legal_name,trade_name)")
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("crm_subscription_periods").select("id,subscription_id,seq,period_start,period_end,amount,invoice_id,usage").order("seq", { ascending: false }).limit(600),
    supabase.from("crm_sale_lines").select("id,line_total,billing_type,sale_id,crm_sales(sale_number,status,currency),crm_service_catalog(name)").in("billing_type", ["monthly", "annual"]).order("created_at", { ascending: false }).limit(200),
    supabase.from("crm_invoices").select("id,number,sale_id,amount,currency").eq("status", "issued").order("issued_on", { ascending: false }).limit(300),
  ]);
  const subs = (subsR.data ?? []) as unknown as Sub[];
  const periods = (periodsR.data ?? []) as Period[];
  const lines = ((linesR.data ?? []) as unknown as Line[]).filter(l => l.crm_sales?.status === "confirmed");
  const openedLines = new Set((await supabase.from("crm_subscriptions").select("sale_line_id").limit(1000)).data?.map((x: { sale_line_id: string }) => x.sale_line_id) ?? []);
  const candidates = lines.filter(l => !openedLines.has(l.id));
  const invoices = (invR.data ?? []) as Invoice[];
  const ok = q(p, "ok"), err = q(p, "error");
  return <Suite active="crm"><div className={s.hud} data-subscriptions>
    <OpsHeader lang={lang} active="subscriptions" eyebrow={t("Ventas / Suscripciones", "Sales / Subscriptions")} title={t("Suscripciones", "Subscriptions")}
      lead={t("Productos recurrentes abiertos desde ventas confirmadas: activación, períodos, renovaciones, suspensión, cancelación, consumo y factura de cada período. Los importes salen de la venta.",
        "Recurring products opened from confirmed sales: activation, periods, renewals, suspension, cancellation, usage and each period's invoice. Amounts come from the sale.")} />
    {ok && <p role="status" className={s.flash}>{t("Cambio registrado.", "Change recorded.")}</p>}
    {err && <p role="alert" className={s.flash} data-tone="error">{pick(lang, ...(ERRORS[err] ?? ERRORS.failed))}</p>}
    {(subsR.error || periodsR.error) && <p role="alert" className={s.flash}>{t("Las suscripciones aún no están activadas en este entorno (migración pendiente).", "Subscriptions are not enabled in this environment yet (migration pending).")}</p>}

    <section className={s.panel} aria-labelledby="sub-open">
      <h2 id="sub-open">{t("Abrir suscripción desde una venta", "Open a subscription from a sale")}</h2>
      {!candidates.length ? <p className={s.muted}>{t("No hay líneas mensuales o anuales de ventas confirmadas sin suscripción.", "No monthly or annual lines of confirmed sales without a subscription.")}</p> :
        <form action={subscriptionAction} className={s.form}>
          <input type="hidden" name="op" value="open" />
          <label className={s.field}>{t("Línea de venta", "Sale line")} <select name="sale_line_id" required defaultValue="">
            <option value="" disabled>{t("Seleccionar", "Select")}</option>
            {candidates.map(l => <option key={l.id} value={l.id}>{l.crm_sales?.sale_number} · {l.crm_service_catalog?.name} · {l.crm_sales?.currency} {l.line_total} / {l.billing_type === "annual" ? t("año", "year") : t("mes", "month")}</option>)}
          </select></label>
          <label className={s.field}>{t("Renovación", "Renewal")} <select name="renewal_mode" defaultValue="manual">
            <option value="manual">{t("Manual (requiere confirmación del cliente)", "Manual (client confirms)")}</option>
            <option value="auto">{t("Automática (según contrato firmado)", "Automatic (per signed agreement)")}</option>
            <option value="none">{t("Sin renovación", "No renewal")}</option></select></label>
          <label className={s.field}>{t("Consumo incluido (opcional)", "Included usage (optional)")} <input name="included_usage" inputMode="decimal" /></label>
          <label className={s.field}>{t("Unidad (minutos, mensajes…)", "Unit (minutes, messages…)")} <input name="usage_unit" maxLength={40} /></label>
          <button className={s.button} type="submit">{t("Abrir", "Open")}</button>
        </form>}
    </section>

    <section className={s.panel} aria-labelledby="sub-list">
      <h2 id="sub-list">{t("Suscripciones", "Subscriptions")} ({subs.length})</h2>
      {!subs.length ? <p className={s.muted}>{t("Todavía no hay suscripciones.", "No subscriptions yet.")}</p> :
        <ul style={{ listStyle: "none", padding: 0 }}>{subs.map(x => {
          const client = x.crm_clients ? (x.crm_clients.trade_name || x.crm_clients.legal_name) : "—";
          const product = (lang === "en" ? x.crm_service_catalog?.name_en : "") || x.crm_service_catalog?.name || "—";
          const mine = periods.filter(pe => pe.subscription_id === x.id);
          const current = mine.find(pe => pe.period_start === x.current_period_start);
          const saleInvoices = invoices.filter(i => i.sale_id === x.sale_id);
          return <li key={x.id} data-subscription={x.status} style={{ padding: "12px 0", borderBottom: "1px solid var(--line, #e1e5ef)" }}>
            <strong>{product}</strong> · {client} · <span className={s.tag}>{pick(lang, ...(STATUS[x.status] ?? [x.status, x.status]))}</span>
            {x.cancel_at_period_end && <> · <span className={s.tag} data-tone="warn">{t("Termina al fin del período", "Ends at period end")}</span></>}
            <br /><small className={s.muted}>{x.currency} {x.amount} / {x.period === "annual" ? t("año", "year") : t("mes", "month")} · {t("renovación", "renewal")} {x.renewal_mode}
              {x.current_period_start && ` · ${t("período", "period")} ${x.current_period_start} → ${x.current_period_end}`}
              {x.ended_on && ` · ${t("finalizó", "ended")} ${formatDate(lang, x.ended_on)}`}
              {current && x.included_usage != null && ` · ${t("consumo", "usage")} ${current.usage}/${x.included_usage} ${x.usage_unit}`}</small>
            <div className={s.inline} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {x.status === "pending_activation" && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="activate" /><input type="hidden" name="subscription_id" value={x.id} />
                <label className={s.field}>{t("Inicio", "Start")} <input type="date" name="start" required /></label><button className={s.button} type="submit">{t("Activar", "Activate")}</button></form>}
              {x.status === "active" && x.current_period_end && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="renew" /><input type="hidden" name="subscription_id" value={x.id} />
                <input type="hidden" name="period_end" value={x.current_period_end} /><button className={s.button} type="submit">{x.cancel_at_period_end || x.renewal_mode === "none" ? t("Cerrar al fin del período", "Close at period end") : t("Renovar siguiente período", "Renew next period")}</button></form>}
              {x.status === "active" && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="suspend" /><input type="hidden" name="subscription_id" value={x.id} />
                <input name="reason" minLength={5} required placeholder={t("Motivo", "Reason")} aria-label={t("Motivo de suspensión", "Suspension reason")} /><button className={s.button} type="submit">{t("Suspender", "Suspend")}</button></form>}
              {x.status === "suspended" && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="reactivate" /><input type="hidden" name="subscription_id" value={x.id} />
                <input name="reason" placeholder={t("Nota", "Note")} aria-label={t("Nota de reactivación", "Reactivation note")} /><button className={s.button} type="submit">{t("Reactivar", "Reactivate")}</button></form>}
              {["active", "suspended", "pending_activation"].includes(x.status) && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="cancel" /><input type="hidden" name="subscription_id" value={x.id} />
                <select name="mode" defaultValue="end_of_period" aria-label={t("Tipo de cancelación", "Cancellation type")}>
                  {x.status !== "pending_activation" && <option value="end_of_period">{t("Al fin del período", "At period end")}</option>}
                  <option value="immediate">{t("Inmediata", "Immediate")}</option></select>
                <input name="reason" minLength={5} required placeholder={t("Motivo", "Reason")} aria-label={t("Motivo de cancelación", "Cancellation reason")} /><button className={s.button} type="submit">{t("Cancelar", "Cancel")}</button></form>}
              {["active", "suspended"].includes(x.status) && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="usage" /><input type="hidden" name="subscription_id" value={x.id} />
                <input name="units" inputMode="decimal" required placeholder={t("Consumo", "Usage")} aria-label={t("Consumo del período", "Period usage")} /><button className={s.button} type="submit">{t("Registrar consumo", "Record usage")}</button></form>}
            </div>
            {mine.length > 0 && <details><summary>{t("Períodos y facturas", "Periods and invoices")} ({mine.length})</summary><ul>{mine.map(pe => <li key={pe.id}>
              #{pe.seq} · {pe.period_start} → {pe.period_end} · {x.currency} {pe.amount} · {pe.invoice_id ? t("factura vinculada", "invoice linked") : t("sin factura", "no invoice")}
              {!pe.invoice_id && saleInvoices.length > 0 && <form action={subscriptionAction} className={s.inline}><input type="hidden" name="op" value="link_invoice" /><input type="hidden" name="period_id" value={pe.id} />
                <select name="invoice_id" required defaultValue="" aria-label={t("Factura emitida", "Issued invoice")}><option value="" disabled>{t("Factura emitida…", "Issued invoice…")}</option>
                  {saleInvoices.map(i => <option key={i.id} value={i.id}>{i.number} · {i.currency} {i.amount}</option>)}</select>
                <button className={s.button} type="submit">{t("Vincular", "Link")}</button></form>}
            </li>)}</ul></details>}
          </li>;
        })}</ul>}
    </section>
  </div></Suite>;
}
