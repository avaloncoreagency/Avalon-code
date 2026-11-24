import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { label, money } from "@/lib/sales/domain";
import { getCrmCapabilities } from "@/lib/sales/client-finance-server";
import { loadSaleSchedule } from "@/lib/sales/schedule-server";
import { fromCents, installmentStates, paymentStatus, proposeSchedule, toCents, type PaymentRow } from "@/lib/sales/schedule";
import type { SalePaymentTerms } from "@/lib/sales/payment-terms";
import { refundPayment, resolveChargeback } from "@/app/admin/workspace/crm/sales/actions";
import { ScheduleEditor } from "./schedule-editor";
import { Tag } from "./ui";
import s from "./sales.module.css";

type SaleLite = { id: string; total: string; upfront_amount: string; sold_on: string; currency: string; schedule_version?: number | null; status?: string };

/**
 * Collections for one sale: receivables summary, typed installment schedule (editable), and refunds / chargebacks on
 * verified receipts. Finance-only (database capability + RLS). Nothing here moves money: it documents what happened.
 */
export async function SaleSchedulePanel({ db, lang, sale, payments, terms }: {
  db: SupabaseClient; lang: Lang; sale: SaleLite; payments: (PaymentRow & { method: string; reference: string })[]; terms: SalePaymentTerms | null;
}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const caps = await getCrmCapabilities(db);
  const head = <header><h2 id="collections">{t("Cobranza y calendario de pagos", "Collections and payment schedule")}</h2></header>;
  if (!caps.financeView) return <section className={s.panel} aria-labelledby="collections">{head}
    <p className={s.muted}>{t("Necesitas acceso financiero para ver y gestionar el calendario, reembolsos y contracargos.", "You need finance access to view and manage the schedule, refunds and chargebacks.")}</p></section>;
  const data = await loadSaleSchedule(db, sale.id);
  if (data.state !== "ready") return <section className={s.panel} aria-labelledby="collections">{head}
    <p role="status" className={s.muted}>{data.state === "schema_pending"
      ? t("El calendario de pagos se activa al aplicar la migración 20261123150000 (pendiente de aprobación).", "The payment schedule activates once migration 20261123150000 is applied (pending approval).")
      : t("No se pudo leer la cobranza ahora mismo.", "Collections could not be read right now.")}</p></section>;

  const today = new Date().toISOString().slice(0, 10);
  const states = installmentStates(data.installments, payments, today);
  const live = states.filter(r => r.status === "scheduled");
  const funded = live.filter(r => r.funded);
  const lockedCents = funded.reduce((a, r) => a + (toCents(r.amount) ?? 0), 0);
  const totalCents = toCents(sale.total) ?? 0;
  const editable = live.filter(r => !r.funded).map(r => ({ kind: r.kind as never, due_on: r.due_on, amount: r.amount, label: r.label }));
  const initial = live.length ? editable : proposeSchedule({ total: sale.total, upfront: sale.upfront_amount, soldOn: sale.sold_on, terms });
  const rec = data.receivable;
  const status = rec ? paymentStatus(rec) : "unpaid";
  const refundedFor = (paymentId: string) => data.refunds.filter(r => r.payment_id === paymentId && (r.kind === "refund" || r.resolution !== "won"))
    .reduce((a, r) => a + (toCents(r.amount) ?? 0), 0);
  const m = (v: string | number | null | undefined) => money(lang, v ?? 0, sale.currency);

  return <section className={s.panel} aria-labelledby="collections" data-payment-status={status}>
    <header><h2 id="collections">{t("Cobranza y calendario de pagos", "Collections and payment schedule")}</h2><Tag lang={lang} value={status} /></header>
    {rec && <div className={s.stats} aria-label={t("Resumen de cobranza", "Collections summary")}>
      <div className={s.stat}><span>{t("Cobrado neto", "Net collected")}</span><strong>{m(rec.net_collected)}</strong><small>{t("Verificado", "Verified")}: {m(rec.verified)}</small></div>
      <div className={s.stat}><span>{t("Saldo pendiente", "Balance due")}</span><strong>{m(rec.balance)}</strong><small>{t("de", "of")} {m(rec.total)}</small></div>
      <div className={s.stat}><span>{t("Vencido", "Overdue")}</span><strong>{m(rec.overdue)}</strong><small>{t("Próximo vencimiento", "Next due")}: {rec.next_due ? formatDate(lang, rec.next_due) : "—"}</small></div>
      <div className={s.stat}><span>{t("Reembolsado / contracargos", "Refunded / chargebacks")}</span><strong>{m(rec.refunded)}</strong><small>{rec.open_chargebacks ? t(`${rec.open_chargebacks} contracargo(s) abierto(s)`, `${rec.open_chargebacks} open chargeback(s)`) : t("Sin disputas abiertas", "No open disputes")}</small></div>
    </div>}

    <h3>{t("Calendario de pagos", "Payment schedule")}</h3>
    {live.length === 0 ? <p className={s.muted}>{t("Sin calendario. Créalo abajo; si la venta tiene un plan acordado, ya viene propuesto y cuadrado al total.", "No schedule yet. Create it below; if the sale has an agreed plan it is pre-filled and adds up to the total.")}</p> :
      <div className={s.tableWrap}><table className={s.table} aria-label={t("Cuotas", "Installments")}>
        <thead><tr><th scope="col">#</th><th scope="col">{t("Tipo", "Type")}</th><th scope="col">{t("Vence", "Due")}</th><th scope="col" className={s.num}>{t("Importe", "Amount")}</th><th scope="col" className={s.num}>{t("Cubierto", "Covered")}</th><th scope="col">{t("Estado", "Status")}</th></tr></thead>
        <tbody>{live.map(r => <tr key={r.id} data-state={r.state}>
          <td>{r.seq}</td><td>{label(lang, r.kind)}{r.label ? <><br /><span className={s.muted}>{r.label}</span></> : null}</td>
          <td>{formatDate(lang, r.due_on)}</td><td className={s.num}>{m(r.amount)}</td>
          <td className={s.num}>{m(fromCents(r.coveredCents))}{r.funded ? <><br /><span className={s.muted}>{t("asignado", "allocated")}: {m(fromCents(r.allocatedCents))}</span></> : null}</td>
          <td><Tag lang={lang} value={r.state} /></td>
        </tr>)}</tbody>
      </table></div>}
    {states.some(r => r.status !== "scheduled") && <p className={s.muted}>{t(`${states.length - live.length} cuota(s) de calendarios anteriores se conservan como canceladas en el historial.`, `${states.length - live.length} installment(s) from earlier schedules are kept as cancelled in the history.`)}</p>}

    {sale.status !== "cancelled" && <details open={live.length === 0}>
      <summary>{live.length ? t("Reprogramar cuotas sin cobrar", "Reschedule unpaid installments") : t("Crear calendario de pagos", "Create payment schedule")}</summary>
      {funded.length > 0 && <p className={s.muted}>{t(`Se mantienen fijas ${funded.length} cuota(s) con cobros asignados (${m(fromCents(lockedCents))}).`, `${funded.length} installment(s) with allocated receipts stay fixed (${m(fromCents(lockedCents))}).`)}</p>}
      <ScheduleEditor lang={lang} saleId={sale.id} version={sale.schedule_version ?? 0} totalCents={totalCents} lockedCents={lockedCents}
        soldOn={sale.sold_on} currency={sale.currency} initial={initial} replacing={live.length > 0} />
      <p className={s.muted}>{t("Planificación interna: no emite facturas, no cobra ni aprueba financiamiento. Los vencimientos exigibles los fija el contrato firmado.", "Internal planning: it does not issue invoices, charge anyone or approve financing. Enforceable due dates come from the signed contract.")}</p>
    </details>}

    <h3>{t("Reembolsos y contracargos", "Refunds and chargebacks")}</h3>
    {data.refunds.length === 0 ? <p className={s.muted}>{t("Ninguno registrado.", "None recorded.")}</p> :
      <ul className={s.list}>{data.refunds.map(r => <li key={r.id} data-kind={r.kind}>
        <strong>{label(lang, r.kind)} · {m(r.amount)}</strong>
        <span className={s.muted}>{formatDate(lang, r.occurred_on)} · {r.reason}{r.reference ? ` · ${r.reference}` : ""}</span>
        {r.kind === "chargeback" && <span><Tag lang={lang} value={r.resolution === "open" ? "disputed" : r.resolution ?? "disputed"} />{r.resolution_note ? <span className={s.muted}> {r.resolution_note}</span> : null}</span>}
        {r.kind === "chargeback" && r.resolution === "open" && <form action={resolveChargeback} className={s.inline}>
          <input type="hidden" name="sale_id" value={sale.id} /><input type="hidden" name="refund_id" value={r.id} />
          <label className={s.srOnly} htmlFor={`o-${r.id}`}>{t("Resultado", "Outcome")}</label>
          <select id={`o-${r.id}`} name="outcome" defaultValue="won"><option value="won">{t("Ganado (fondos devueltos)", "Won (funds returned)")}</option><option value="lost">{t("Perdido", "Lost")}</option></select>
          <label className={s.srOnly} htmlFor={`n-${r.id}`}>{t("Nota", "Note")}</label>
          <input id={`n-${r.id}`} name="note" required minLength={5} maxLength={500} placeholder={t("Resolución del banco", "Bank decision")} />
          <button className={s.button}>{t("Resolver", "Resolve")}</button></form>}
      </li>)}</ul>}
    {payments.filter(p => p.status === "verified" && (toCents(p.amount) ?? 0) - refundedFor(p.id) > 0).map(p => {
      const refundable = (toCents(p.amount) ?? 0) - refundedFor(p.id);
      return <details key={p.id}>
        <summary>{t("Reembolso o contracargo del pago", "Refund or chargeback on payment")} {m(p.amount)} · {formatDate(lang, p.received_on)}</summary>
        <form action={refundPayment} className={s.form}>
          <input type="hidden" name="sale_id" value={sale.id} /><input type="hidden" name="payment_id" value={p.id} />
          {/* Rendered once per page load: a double submit or retry replays the same refund instead of duplicating it. */}
          <input type="hidden" name="idempotency_key" value={randomUUID()} />
          <div className={s.row}>
            <label className={s.field}>{t("Tipo", "Type")}<select name="kind" defaultValue="refund"><option value="refund">{t("Reembolso al cliente", "Refund to client")}</option><option value="chargeback">{t("Contracargo del banco", "Bank chargeback")}</option></select></label>
            <label className={s.field}>{t("Importe", "Amount")} ({t("máx.", "max")} {m(fromCents(refundable))})<input name="amount" required inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" defaultValue={fromCents(refundable)} /></label>
            <label className={s.field}>{t("Fecha", "Date")}<input name="occurred_on" type="date" required min={p.received_on} defaultValue={today} /></label>
          </div>
          <label className={s.field}>{t("Motivo documentado", "Documented reason")}<input name="reason" required minLength={5} maxLength={500} /></label>
          <label className={s.field}>{t("Referencia (sin datos bancarios)", "Reference (no bank details)")}<input name="reference" maxLength={120} /></label>
          <button className={s.button}>{t("Registrar", "Record")}</button>
          <p className={s.muted}>{t("Documenta un movimiento que ya ocurrió fuera de Avalon. Avalon no devuelve dinero ni contacta al banco.", "Documents a movement that already happened outside Avalon. Avalon does not return money or contact the bank.")}</p>
        </form>
      </details>;
    })}
  </section>;
}
