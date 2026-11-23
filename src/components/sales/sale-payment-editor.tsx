"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import {
  DEFAULT_SALE_PAYMENT_TERMS, SALE_PAYMENT_METHODS, SALE_PAYMENT_SCHEDULES,
  SALE_PAYMENT_FREQUENCIES, installmentPreview, installmentSchedule, salePaymentMethodLabel,
  salePaymentScheduleLabel, validateSalePaymentTerms, type SalePaymentTerms,
} from "@/lib/sales/payment-terms";
import { money } from "@/lib/sales/domain";
import s from "./sales.module.css";

const t = (lang: Lang, es: string, en: string) => lang === "es" ? es : en;
const frequencyName = (v: string, lang: Lang) => ({
  weekly: t(lang, "Semanal", "Weekly"), biweekly: t(lang, "Cada dos semanas", "Every two weeks"),
  monthly: t(lang, "Mensual", "Monthly"),
} as Record<string, string>)[v] ?? v;

/**
 * A payment AGREEMENT, not a payment collection or consumer-credit application.
 * Submitted as versioned, validated JSON inside the existing sale confirmation.
 */
export function SalePaymentEditor({ lang, initial, total, recurring, upfront, currency, onScheduleChange }: {
  lang: Lang; initial?: string; total: number; recurring: number; upfront: string; currency: string; onScheduleChange?: (schedule: SalePaymentTerms["schedule"]) => void;
}) {
  const [terms, setTerms] = useState<SalePaymentTerms>(() => {
    try { return initial ? validateSalePaymentTerms(JSON.parse(initial)) : { ...DEFAULT_SALE_PAYMENT_TERMS }; }
    catch { return { ...DEFAULT_SALE_PAYMENT_TERMS }; }
  });
  const set = <K extends keyof SalePaymentTerms>(key: K, value: SalePaymentTerms[K]) =>
    setTerms(prev => ({ ...prev, [key]: value }));
  const estimate = installmentPreview(total, Number(upfront || 0), terms.installments);
  const installmentAllowed = recurring <= 0 && Number.isFinite(total) && total > 0;
  const scheduleRows = installmentAllowed ? installmentSchedule(total, Number(upfront || 0), terms) : null;

  return <fieldset className={s.fieldset}>
    <legend>{t(lang, "4 · Plan de pago acordado", "4 · Agreed payment plan")}</legend>
    <input type="hidden" name="payment_terms_json" value={JSON.stringify(terms)} />
    <p className={s.muted}>{t(lang,
      "Registra cómo se acordó cobrar, sin marcar dinero como recibido. Los cobros reales se registran en la ficha de la venta.",
      "Document how payment is agreed, without treating it as collected. Actual receipts are recorded on the sale detail page.")}</p>
    <div className={s.row}>
      <label className={s.field}>{t(lang, "Método preferido", "Preferred payment method")}
        <select value={terms.method} onChange={e => set("method", e.target.value as SalePaymentTerms["method"])}>
          {SALE_PAYMENT_METHODS.map(x => <option value={x} key={x}>{salePaymentMethodLabel(x, lang)}</option>)}
        </select>
      </label>
      <label className={s.field}>{t(lang, "Modalidad acordada", "Agreed payment arrangement")}
        <select value={terms.schedule} onChange={e => {
          const schedule = e.target.value as SalePaymentTerms["schedule"];
          set("schedule", schedule);
          onScheduleChange?.(schedule);
        }}>
          {SALE_PAYMENT_SCHEDULES.map(x => <option value={x} key={x}>{salePaymentScheduleLabel(x, lang)}</option>)}
        </select>
      </label>
      <label className={s.field}>{t(lang, "Plazo de vencimiento (días)", "Invoice due in (days)")}
        <input type="number" min={0} max={365} step={1} value={terms.netDays}
          onChange={e => set("netDays", Math.min(365, Math.max(0, Math.trunc(Number(e.target.value) || 0))))} />
      </label>
    </div>

    {terms.schedule === "to_agree" && <p className={s.muted}>{t(lang,
      "Todavía no se ha confirmado una modalidad de pago. No se asumen condiciones ni se registran cobros.",
      "No payment arrangement has been confirmed. No payment terms or receipts are assumed.")}</p>}

    {terms.schedule === "full" && <p className={s.muted}>{t(lang, "Pago total previsto:", "Expected full amount:")} <strong>{money(lang, total, currency)}</strong>. {t(lang, "No está cobrado.", "Not collected.")}</p>}

    {terms.schedule === "deposit_balance" && <div className={s.planSummary}>
      <p>{t(lang, "Anticipo acordado", "Agreed deposit")}: <strong>{money(lang, Number(upfront || 0), currency)}</strong></p>
      <p>{t(lang, "Saldo previsto", "Expected balance")}: <strong>{money(lang, Math.max(0, total - Number(upfront || 0)), currency)}</strong></p>
      {Number(upfront || 0) > total && <p className={s.flash} data-tone="error">{t(lang, "El anticipo supera el total contratado.", "The deposit exceeds the contracted total.")}</p>}
      <p className={s.muted}>{t(lang, "Importes acordados, NO recibidos. Fecha y condiciones finales según contrato firmado.", "Agreed, NOT received. Final due dates and terms follow the signed agreement.")}</p>
    </div>}

    {terms.schedule === "installments" && <>
      <div className={s.row}>
        <label className={s.field}>{t(lang, "Número de cuotas", "Number of installments")}
          <input type="number" min={2} max={36} step={1} value={terms.installments}
            onChange={e => set("installments", Math.min(36, Math.max(2, Math.trunc(Number(e.target.value) || 2))))} required />
        </label>
        <label className={s.field}>{t(lang, "Frecuencia", "Frequency")}
          <select value={terms.frequency} onChange={e => set("frequency", e.target.value as SalePaymentTerms["frequency"])}>
            {SALE_PAYMENT_FREQUENCIES.map(x => <option value={x} key={x}>{frequencyName(x, lang)}</option>)}
          </select>
        </label>
        <label className={s.field}>{t(lang, "Primer vencimiento", "First due date")}
          <input type="date" value={terms.firstDue} required onChange={e => set("firstDue", e.target.value)} />
        </label>
      </div>
      {!installmentAllowed ? <p className={s.flash} data-tone="warn">{t(lang,
        "Las cuotas necesitan un total positivo sin mensualidades recurrentes mezcladas. Separa servicios recurrentes antes de confirmar.",
        "Installments require a positive total without recurring lines mixed in. Separate recurring services before confirming.")}</p>
      : estimate ? <div className={s.planSummary} aria-live="polite">
          <p>{t(lang, "Saldo después del anticipo:", "Balance after deposit:")} <strong>{money(lang, estimate.remaining, currency)}</strong> · {terms.installments - 1} × {money(lang, estimate.regular, currency)} + {t(lang, "última cuota", "last installment")} {money(lang, estimate.final, currency)}</p>
          {scheduleRows && <details>
            <summary>{t(lang, "Ver calendario de vencimientos propuesto", "View proposed payment due-date schedule")} ({scheduleRows.length})</summary>
            <div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>#</th><th>{t(lang, "Fecha", "Date")}</th><th className={s.num}>{t(lang, "Importe", "Amount")}</th></tr></thead>
              <tbody>{scheduleRows.map(row => <tr key={row.number}><td>{row.number}</td><td>{row.dueOn}</td><td className={s.num}>{money(lang, row.amount, currency)}</td></tr>)}</tbody>
            </table></div>
          </details>}
          <p className={s.muted}>{t(lang, "CALENDARIO ILUSTRATIVO: no registra facturas, cobros, vencimientos exigibles ni financiación aprobada. Requiere acuerdo firmado y revisión legal.", "ILLUSTRATIVE SCHEDULE: does not create invoices, receipts, enforceable due dates or approved financing. Requires a signed agreement and legal review.")}</p>
        </div>
        : <p className={s.flash} data-tone="warn">{t(lang, "El anticipo no puede superar el total.", "Deposit cannot exceed the total.")}</p>}
    </>}

    {terms.schedule === "milestones" && <label className={s.field}>{t(lang,
      "Hitos y porcentajes o importes acordados", "Milestones and agreed percentages or amounts")}
      <textarea value={terms.milestones} required minLength={8} maxLength={700} rows={3}
        placeholder={t(lang, "Ej.: 50% al inicio, 30% al aprobar diseño, 20% a la entrega", "E.g. 50% at kickoff, 30% at design approval, 20% upon delivery")}
        onChange={e => set("milestones", e.target.value)} />
      <small>{t(lang, "Revisar que los hitos coincidan con el contrato firmado.", "Verify milestones against the signed contract.")}</small>
    </label>}

    {terms.schedule === "subscription" && <>
      {recurring <= 0 && <p className={s.flash} data-tone="warn" role="alert">{t(lang,
        "Añade al menos un servicio mensual del catálogo antes de confirmar una suscripción.",
        "Add at least one monthly catalog service before confirming a subscription.")}</p>}
      <p className={s.muted}>{t(lang,
        "Las mensualidades requieren un acuerdo de soporte o suscripción aprobado. No se activa ningún débito recurrente.",
        "Monthly payments require an approved subscription or support agreement. No recurring debit is activated.")}
        {recurring > 0 ? " " + t(lang, "Recurrente del catálogo:", "Catalog recurring amount:") + " " + money(lang, recurring, currency) : ""}</p>
    </>}

    {terms.schedule === "external_financing" && <>
      <label className={s.field}>{t(lang, "Proveedor externo (solo referencia)", "External provider (reference only)")}
        <input value={terms.externalProvider} maxLength={120} required
          onChange={e => set("externalProvider", e.target.value)} placeholder={t(lang, "Nombre del proveedor, sin credenciales", "Provider name, no credentials")} />
      </label>
      <p className={s.flash} data-tone="warn">{t(lang,
        "Financiación externa PENDIENTE: requiere aceptación del proveedor y revisión legal. Avalon no concede crédito, no aprueba préstamos ni cobra automáticamente.",
        "External financing PENDING: provider acceptance and legal review required. Avalon does not extend credit, approve loans or charge automatically.")}</p>
    </>}

    <label className={s.field}>{t(lang, "Condiciones adicionales (sin datos bancarios)", "Additional terms (no bank details)")}
      <textarea value={terms.notes} maxLength={700} rows={2} onChange={e => set("notes", e.target.value)}
        placeholder={t(lang, "Ej.: referencia a cláusula aprobada del contrato o fecha de vencimiento", "E.g. reference to approved contract clause or due date")} />
    </label>
    <p className={s.muted}>{t(lang,
      "La modalidad queda registrada como acuerdo interno; no crea una factura, autorización de tarjeta, préstamo, débito ni recibo.",
      "These terms are internal records only; they do not issue an invoice, authorize a card, extend credit, debit an account or record a payment.")}</p>
  </fieldset>;
}
