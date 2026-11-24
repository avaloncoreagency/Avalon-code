"use client";
import { useMemo, useState } from "react";
import { pick, type Lang } from "@/lib/i18n";
import { INSTALLMENT_KINDS, addDays, fromCents, toCents, validateSchedule, type ScheduleItem } from "@/lib/sales/schedule";
import { setSaleSchedule } from "@/app/admin/workspace/crm/sales/actions";
import s from "./sales.module.css";

const KIND: Record<string, [string, string]> = { deposit: ["Anticipo", "Deposit"], installment: ["Cuota", "Installment"], balance: ["Saldo", "Balance"], milestone: ["Hito", "Milestone"], recurring: ["Recurrente", "Recurring"] };
const ERR: Record<string, [string, string]> = {
  schedule_empty: ["Añade al menos una cuota.", "Add at least one installment."],
  schedule_too_long: ["Máximo 60 cuotas.", "At most 60 installments."],
  schedule_invalid: ["Revisa tipo y etiqueta de cada fila.", "Check each row's type and label."],
  schedule_invalid_date: ["Cada vencimiento debe ser una fecha real desde la fecha de venta.", "Every due date must be a real date from the sale date on."],
  schedule_invalid_amount: ["Cada importe debe ser positivo, con hasta 2 decimales.", "Every amount must be positive, up to 2 decimals."],
  schedule_total_mismatch: ["La suma no coincide con el total.", "The sum does not match the total."],
};

/**
 * Editable rows for the UNFUNDED part of the schedule. Funded installments are shown above (read-only) and their sum is
 * passed as `lockedCents`. The sum is computed in integer cents; the server re-validates everything.
 */
export function ScheduleEditor({ lang, saleId, version, totalCents, lockedCents, soldOn, currency, initial, replacing }: {
  lang: Lang; saleId: string; version: number; totalCents: number; lockedCents: number; soldOn: string; currency: string;
  initial: ScheduleItem[]; replacing: boolean;
}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const [rows, setRows] = useState<ScheduleItem[]>(initial.length ? initial : [{ kind: "balance", due_on: addDays(soldOn, 30), amount: fromCents(totalCents - lockedCents), label: "" }]);
  const sum = rows.reduce((a, r) => a + (toCents(r.amount) ?? 0), 0);
  const error = useMemo(() => validateSchedule(rows, totalCents, soldOn, lockedCents), [rows, totalCents, soldOn, lockedCents]);
  const left = totalCents - lockedCents - sum;
  const set = (i: number, patch: Partial<ScheduleItem>) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const fmt = (c: number) => `${currency} ${fromCents(c)}`;
  return <form action={setSaleSchedule} className={s.form} aria-label={t("Editor del calendario de pagos", "Payment schedule editor")}>
    <input type="hidden" name="sale_id" value={saleId} />
    <input type="hidden" name="schedule_version" value={version} />
    <input type="hidden" name="items" value={JSON.stringify(rows)} />
    <div className={s.tableWrap}><table className={s.table}>
      <thead><tr><th scope="col">{t("Tipo", "Type")}</th><th scope="col">{t("Vence", "Due")}</th><th scope="col" className={s.num}>{t("Importe", "Amount")}</th><th scope="col">{t("Etiqueta", "Label")}</th><th scope="col"><span className={s.srOnly}>{t("Quitar", "Remove")}</span></th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>
        <td><label className={s.srOnly} htmlFor={`k-${i}`}>{t("Tipo", "Type")} {i + 1}</label>
          <select id={`k-${i}`} value={r.kind} onChange={e => set(i, { kind: e.target.value as ScheduleItem["kind"] })}>{INSTALLMENT_KINDS.map(k => <option key={k} value={k}>{pick(lang, ...KIND[k])}</option>)}</select></td>
        <td><label className={s.srOnly} htmlFor={`d-${i}`}>{t("Vencimiento", "Due date")} {i + 1}</label>
          <input id={`d-${i}`} type="date" min={soldOn} value={r.due_on} onChange={e => set(i, { due_on: e.target.value })} required /></td>
        <td className={s.num}><label className={s.srOnly} htmlFor={`a-${i}`}>{t("Importe", "Amount")} {i + 1}</label>
          <input id={`a-${i}`} inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" value={r.amount} onChange={e => set(i, { amount: e.target.value.trim() })} required style={{ maxWidth: 130 }} /></td>
        <td><label className={s.srOnly} htmlFor={`l-${i}`}>{t("Etiqueta", "Label")} {i + 1}</label>
          <input id={`l-${i}`} maxLength={200} value={r.label} onChange={e => set(i, { label: e.target.value })} /></td>
        <td><button type="button" className={s.button} onClick={() => setRows(x => x.filter((_, j) => j !== i))} disabled={rows.length === 1}
          aria-label={t(`Quitar fila ${i + 1}`, `Remove row ${i + 1}`)}>✕</button></td>
      </tr>)}</tbody>
    </table></div>
    <div className={s.inline}>
      <button type="button" className={s.button} disabled={rows.length >= 60}
        onClick={() => setRows(r => [...r, { kind: "installment", due_on: addDays(r.at(-1)?.due_on ?? soldOn, 30), amount: left > 0 ? fromCents(left) : "", label: "" }])}>
        {t("Añadir cuota", "Add installment")}</button>
    </div>
    <p role="status" aria-live="polite" className={error ? s.warn : s.muted}>
      {t("Total de la venta", "Sale total")}: {fmt(totalCents)}{lockedCents ? ` · ${t("ya cobrado en cuotas fijas", "already funded installments")}: ${fmt(lockedCents)}` : ""} · {t("este calendario", "this schedule")}: {fmt(sum)}
      {left !== 0 ? ` · ${left > 0 ? t("falta", "missing") : t("sobra", "over by")} ${fmt(Math.abs(left))}` : ""}
      {error ? ` — ${pick(lang, ...ERR[error])}` : ` — ${t("cuadra exactamente", "adds up exactly")}`}
    </p>
    {replacing && <label className={s.field}>{t("Motivo del cambio (obligatorio, queda en la auditoría)", "Reason for the change (required, kept in the audit)")}<input name="reason" required minLength={5} maxLength={500} /></label>}
    <button className={s.button} disabled={!!error}>{replacing ? t("Guardar nuevo calendario", "Save new schedule") : t("Crear calendario", "Create schedule")}</button>
  </form>;
}
