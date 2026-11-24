import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { money } from "@/lib/sales/domain";
import { getCrmCapabilities } from "@/lib/sales/client-finance-server";
import { BASE_LABEL, VARIABLE_KIND_LABEL } from "@/lib/sales/quote-close";
import { moveSettlement, recordSettlement } from "@/app/admin/workspace/crm/sales/actions";
import { Tag } from "./ui";
import s from "./sales.module.css";

type Terms = { quote_id: string; quote_number: string; version_no: number; content_sha256: string; accepted_at: string; accepted_note: string; closed_at: string };
type Variable = { id: string; kind: keyof typeof VARIABLE_KIND_LABEL; pct: string; base: string; base_note: string; trigger_event: string; evidence_method: string;
  settlement: string; exclusions: string; refunds: string; expiry: string; effective_on: string; duration_months: number | null };
type Settlement = { id: string; period_start: string; period_end: string; eligible_base: string; excluded_amount: string; pct: string; amount_due: string;
  evidence: string; status: "recorded" | "verified" | "void"; verification_evidence: string; void_reason: string };
const SETTLE: Record<string, [string, string]> = { weekly: ["Semanal", "Weekly"], biweekly: ["Quincenal", "Biweekly"], monthly: ["Mensual", "Monthly"], quarterly: ["Trimestral", "Quarterly"] };

/** Accepted terms (immutable copy from the quote) and, for variable agreements, settlements: verified base × pct. */
export async function SaleAgreementPanel({ db, lang, saleId, currency }: { db: SupabaseClient; lang: Lang; saleId: string; currency: string }) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const [termsR, varR] = await Promise.all([
    db.from("crm_sale_terms").select("quote_id,quote_number,version_no,content_sha256,accepted_at,accepted_note,closed_at").eq("sale_id", saleId).maybeSingle(),
    db.from("crm_sale_variable_terms").select("id,kind,pct,base,base_note,trigger_event,evidence_method,settlement,exclusions,refunds,expiry,effective_on,duration_months").eq("sale_id", saleId).maybeSingle(),
  ]);
  // Before migration 20261123160000, or for legacy/manual sales, there is nothing to show.
  if (termsR.error || !termsR.data) return null;
  const terms = termsR.data as Terms, v = (varR.data ?? null) as Variable | null;
  const caps = v ? await getCrmCapabilities(db) : null;
  const settlementsR = v && caps?.financeView
    ? await db.from("crm_sale_settlements").select("id,period_start,period_end,eligible_base,excluded_amount,pct,amount_due,evidence,status,verification_evidence,void_reason").eq("sale_id", saleId).order("period_start")
    : null;
  const settlements = (settlementsR?.data ?? []) as Settlement[];
  const m = (x: string | number) => money(lang, x, currency);
  const today = new Date().toISOString().slice(0, 10);

  return <section className={s.panel} aria-labelledby="accepted-terms">
    <header><h2 id="accepted-terms">{t("Términos aceptados", "Accepted terms")}</h2></header>
    <p className={s.muted}>{t("Copia inmutable de la versión que aceptó el cliente. Un cambio requiere una nueva cotización o enmienda; nunca se edita aquí.",
      "Immutable copy of the version the client accepted. A change needs a new quote or amendment; it is never edited here.")}</p>
    <dl className={s.detail}>
      <div><dt>{t("Cotización", "Quote")}</dt><dd><Link href={`/admin/workspace/crm/quotes/${terms.quote_id}`}>{terms.quote_number} v{terms.version_no}</Link></dd></div>
      <div><dt>{t("Aceptada", "Accepted")}</dt><dd>{formatDate(lang, terms.accepted_at)}{terms.accepted_note ? ` · ${terms.accepted_note}` : ""}</dd></div>
      <div><dt>{t("Cerrada", "Closed")}</dt><dd>{formatDate(lang, terms.closed_at, true)}</dd></div>
      <div><dt>{t("Huella", "Fingerprint")}</dt><dd><code>{terms.content_sha256.slice(0, 16)}…</code></dd></div>
    </dl>

    {v && <div data-variable-agreement>
      <h3>{pick(lang, ...VARIABLE_KIND_LABEL[v.kind])} · {Number(v.pct)}%</h3>
      <p className={s.flash} data-tone="warn">{v.kind === "revenue_share"
        ? t("Venta por participación en ingresos — importe variable pendiente de liquidación.", "Revenue-share sale — variable amount pending settlement.")
        : t("Venta con comisión variable — importe pendiente de liquidación.", "Variable-commission sale — amount pending settlement.")}</p>
      <dl className={s.detail}>
        <div><dt>{t("Base", "Base")}</dt><dd>{pick(lang, ...(BASE_LABEL[v.base] ?? [v.base, v.base]))}{v.base_note ? ` — ${v.base_note}` : ""}</dd></div>
        <div><dt>{t("Genera derecho", "Earned when")}</dt><dd>{v.trigger_event}</dd></div>
        <div><dt>{t("Comprobación", "Verification")}</dt><dd>{v.evidence_method}</dd></div>
        <div><dt>{t("Liquidación", "Settlement")}</dt><dd>{pick(lang, ...(SETTLE[v.settlement] ?? [v.settlement, v.settlement]))}</dd></div>
        <div><dt>{t("Vigencia", "Term")}</dt><dd>{t("desde", "from")} {formatDate(lang, v.effective_on)}{v.duration_months ? ` · ${v.duration_months} ${t("meses", "months")}` : ""}</dd></div>
        {v.exclusions && <div><dt>{t("Exclusiones", "Exclusions")}</dt><dd>{v.exclusions}</dd></div>}
      </dl>

      <h3>{t("Liquidaciones", "Settlements")}</h3>
      {!caps?.financeView ? <p className={s.muted}>{t("Necesitas acceso financiero para ver y registrar liquidaciones.", "You need finance access to view and record settlements.")}</p> : <>
        {settlements.length === 0 ? <p className={s.muted}>{t("Sin periodos liquidados todavía.", "No settled periods yet.")}</p> :
          <div className={s.tableWrap}><table className={s.table} aria-label={t("Liquidaciones", "Settlements")}>
            <thead><tr><th scope="col">{t("Periodo", "Period")}</th><th scope="col" className={s.num}>{t("Base elegible", "Eligible base")}</th><th scope="col" className={s.num}>{t("Exclusiones", "Excluded")}</th>
              <th scope="col" className={s.num}>{t("Importe", "Amount due")}</th><th scope="col">{t("Estado", "Status")}</th><th scope="col">{t("Acción", "Action")}</th></tr></thead>
            <tbody>{settlements.map(x => <tr key={x.id} data-status={x.status}>
              <td>{formatDate(lang, x.period_start)} – {formatDate(lang, x.period_end)}<br /><span className={s.muted}>{x.evidence}</span></td>
              <td className={s.num}>{m(x.eligible_base)}</td><td className={s.num}>{m(x.excluded_amount)}</td>
              <td className={s.num}><strong>{m(x.amount_due)}</strong><br /><span className={s.muted}>{Number(x.pct)}%</span></td>
              <td><Tag lang={lang} value={x.status === "recorded" ? "pending" : x.status === "void" ? "cancelled" : "verified"} />{x.verification_evidence ? <><br /><span className={s.muted}>{x.verification_evidence}</span></> : null}</td>
              <td>{x.status !== "void" && <form action={moveSettlement} className={s.inline}>
                <input type="hidden" name="sale_id" value={saleId} /><input type="hidden" name="settlement_id" value={x.id} />
                <label className={s.srOnly} htmlFor={`to-${x.id}`}>{t("Acción", "Action")}</label>
                <select id={`to-${x.id}`} name="to" defaultValue={x.status === "recorded" ? "verified" : "void"}>
                  {x.status === "recorded" && <option value="verified">{t("Verificar", "Verify")}</option>}<option value="void">{t("Anular", "Void")}</option></select>
                <label className={s.srOnly} htmlFor={`n-${x.id}`}>{t("Evidencia o motivo", "Evidence or reason")}</label>
                <input id={`n-${x.id}`} name="note" required minLength={3} maxLength={500} placeholder={t("Evidencia / motivo", "Evidence / reason")} />
                <button className={s.button}>{t("Guardar", "Save")}</button></form>}</td>
            </tr>)}</tbody>
          </table></div>}
        <details open={settlements.length === 0}>
          <summary>{t("Registrar periodo", "Record period")}</summary>
          <form action={recordSettlement} className={s.form} aria-label={t("Registrar liquidación", "Record settlement")}>
            <input type="hidden" name="sale_id" value={saleId} /><input type="hidden" name="idempotency_key" value={randomUUID()} />
            <div className={s.row}>
              <label className={s.field}>{t("Desde", "From")}<input type="date" name="period_start" required min={v.effective_on} /></label>
              <label className={s.field}>{t("Hasta", "To")}<input type="date" name="period_end" required min={v.effective_on} max={today} /></label>
            </div>
            <div className={s.row}>
              <label className={s.field}>{t("Base elegible verificada", "Verified eligible base")} ({currency})<input name="eligible_base" required inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" /></label>
              <label className={s.field}>{t("Exclusiones", "Excluded")} ({currency})<input name="excluded_amount" inputMode="decimal" pattern="\d{1,13}(\.\d{1,2})?" defaultValue="0" /></label>
            </div>
            <label className={s.field}>{t("Evidencia (reporte, conciliación…)", "Evidence (report, reconciliation…)")}<input name="evidence" required minLength={5} maxLength={500} /></label>
            <p className={s.muted}>{t(`Importe = (base − exclusiones) × ${Number(v.pct)}%, calculado por la base de datos. Solo las liquidaciones verificadas son cobrables.`,
              `Amount = (base − excluded) × ${Number(v.pct)}%, computed by the database. Only verified settlements are collectible.`)}</p>
            <button className={s.button}>{t("Registrar liquidación", "Record settlement")}</button>
          </form>
        </details>
      </>}
    </div>}
  </section>;
}
