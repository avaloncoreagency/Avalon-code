import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { formatUsd, type QuoteContent } from "@/lib/quotes/model";
import { BASE_LABEL, CLOSE_BLOCKER_TEXT, VARIABLE_KIND_LABEL, closeSummary, type CatalogEntry } from "@/lib/sales/quote-close";
import { closeSaleFromQuote } from "@/app/admin/workspace/crm/sales/actions";
import s from "./sales.module.css";

const SETTLE: Record<string, [string, string]> = { weekly: ["Semanal", "Weekly"], biweekly: ["Quincenal", "Biweekly"], monthly: ["Mensual", "Monthly"], quarterly: ["Trimestral", "Quarterly"] };
const MODEL: Record<string, [string, string]> = { fixed: ["Precio fijo", "Fixed price"], monthly: ["Suscripción", "Subscription"], commission: ["Variable (porcentaje / comisión)", "Variable (percentage / commission)"], hybrid: ["Híbrido", "Hybrid"] };
const CLOSE_ERRORS: Record<string, [string, string]> = {
  quote_version_changed: ["La cotización cambió mientras revisabas. Recarga y revisa la versión vigente.", "The quote changed while you were reviewing. Reload and review the current version."],
  won_requires_verified_contract: ["Falta un contrato firmado y verificado para esta oportunidad.", "A signed, verified contract for this opportunity is missing."],
  crm_forbidden: ["No tienes permiso para cerrar ventas.", "You are not allowed to close sales."],
};

/**
 * "Cerrar venta" on the accepted quote: the final review of everything the client accepted, the blockers that still
 * prevent closing, and the single action that registers the sale with exactly these terms (crm_quote_close_sale).
 */
export async function QuoteClosePanel({ db, lang, quote, content, closeError }: {
  db: SupabaseClient; lang: Lang; content: QuoteContent; closeError?: string | null;
  quote: { id: string; status: string; current_version: number; lead_id: string; accepted_at: string | null; quote_number: string };
}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const codes = [...new Set(content.lines.map(l => l.code).filter((c): c is string => !!c))];
  const [catalog, contract, sale, acceptance] = await Promise.all([
    codes.length ? db.from("crm_service_catalog").select("code,billing_type,active").in("code", codes) : Promise.resolve({ data: [] as CatalogEntry[], error: null }),
    db.from("crm_contracts").select("id,title,verified_at").eq("lead_id", quote.lead_id).eq("status", "verified_signed").order("verified_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("crm_sales").select("id,sale_number").eq("quote_id", quote.id).limit(1).maybeSingle(),
    db.from("crm_quote_events").select("note,created_at").eq("quote_id", quote.id).eq("to_status", "accepted").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const summary = closeSummary(content, { status: quote.status, contractVerified: !!contract.data, catalog: (catalog.data ?? []) as CatalogEntry[] });
  const v = summary.variable;
  const errText = closeError ? CLOSE_ERRORS[closeError] ?? (CLOSE_BLOCKER_TEXT as Record<string, [string, string]>)[closeError] ?? ["No se pudo cerrar la venta.", "The sale could not be closed."] : null;
  const head = <header><h2 id="close-sale">{t("Cerrar venta", "Close sale")}</h2></header>;
  if (sale.data) return <section className={s.panel} aria-labelledby="close-sale">{head}
    <p className={s.flash} data-tone="ok">{t("Esta cotización ya se cerró como venta.", "This quote was already closed as a sale.")}{" "}
      <Link href={`/admin/workspace/crm/sales/${sale.data.id}`}>{sale.data.sale_number} →</Link></p></section>;

  return <section className={s.panel} aria-labelledby="close-sale" data-close-ready={summary.blockers.length === 0}>
    {head}
    <p className={s.muted}>{t("Revisión final. La venta se registrará exactamente con estos términos; no se vuelve a escribir nada.", "Final review. The sale is registered with exactly these terms; nothing is typed again.")}</p>
    {errText && <p role="alert" className={s.flash} data-tone="error">{pick(lang, ...errText)}</p>}
    <dl className={s.detail}>
      <div><dt>{t("Cliente", "Client")}</dt><dd>{content.client.company || "—"}{content.client.contact ? ` · ${content.client.contact}` : ""}</dd></div>
      <div><dt>{t("Modelo comercial", "Commercial model")}</dt><dd>{pick(lang, ...MODEL[content.model])}</dd></div>
      <div><dt>{t("Versión aceptada", "Accepted version")}</dt><dd>{quote.quote_number} v{quote.current_version}{quote.accepted_at ? ` · ${formatDate(lang, quote.accepted_at)}` : ""}</dd></div>
      <div><dt>{t("Evidencia de aceptación", "Acceptance evidence")}</dt><dd>{acceptance.data?.note || "—"}</dd></div>
      <div><dt>{t("Contrato", "Contract")}</dt><dd>{contract.data ? `${contract.data.title} · ${t("verificado", "verified")}` : t("Sin contrato verificado", "No verified contract")}</dd></div>
    </dl>
    <div className={s.tableWrap}><table className={s.table} aria-label={t("Servicios aceptados", "Accepted services")}>
      <thead><tr><th scope="col">{t("Servicio", "Service")}</th><th scope="col">{t("Tipo", "Type")}</th><th scope="col" className={s.num}>{t("Cant.", "Qty")}</th><th scope="col" className={s.num}>{t("Precio", "Price")}</th></tr></thead>
      <tbody>{content.lines.map((l, i) => <tr key={i}><td>{l.name}{l.description ? <><br /><span className={s.muted}>{l.description}</span></> : null}</td>
        <td>{l.kind === "monthly" ? t("Mensual", "Monthly") : t("Pago único", "One-time")}</td><td className={s.num}>{l.qty}</td><td className={s.num}>{formatUsd(Math.round(Number(l.unitPrice) * 100), lang)}</td></tr>)}</tbody>
    </table></div>
    <p><strong>{t("Fijo", "Fixed")}:</strong> {formatUsd(summary.oneTimeCents, lang)} · <strong>{t("Recurrente / mes", "Recurring / mo")}:</strong> {formatUsd(summary.monthlyCents, lang)}</p>
    {v && <div className={s.panel} data-variable="true" aria-label={t("Acuerdo variable", "Variable agreement")}>
      <h3>{pick(lang, ...VARIABLE_KIND_LABEL[v.kind])} · {v.pct}%</h3>
      <p className={s.muted}>{t("Importe variable pendiente de liquidación: se calcula con cada periodo verificado.", "Variable amount pending settlement: computed for each verified period.")}</p>
      <dl className={s.detail}>
        <div><dt>{t("Base", "Base")}</dt><dd>{pick(lang, ...(BASE_LABEL[v.base] ?? [v.base, v.base]))}{v.baseNote ? ` — ${v.baseNote}` : ""}</dd></div>
        <div><dt>{t("Genera derecho", "Earned when")}</dt><dd>{v.trigger}</dd></div>
        <div><dt>{t("Comprobación", "Verification")}</dt><dd>{v.evidence}</dd></div>
        <div><dt>{t("Liquidación", "Settlement")}</dt><dd>{pick(lang, ...(SETTLE[v.settlement] ?? [v.settlement, v.settlement]))}</dd></div>
        <div><dt>{t("Vigencia", "Term")}</dt><dd>{v.effectiveDate ? `${t("desde", "from")} ${formatDate(lang, v.effectiveDate)}` : t("desde la fecha de venta", "from the sale date")}{v.durationMonths ? ` · ${v.durationMonths} ${t("meses", "months")}` : ""}</dd></div>
        {v.exclusions && <div><dt>{t("Exclusiones", "Exclusions")}</dt><dd>{v.exclusions}</dd></div>}
        {v.refunds && <div><dt>{t("Reembolsos", "Refunds")}</dt><dd>{v.refunds}</dd></div>}
      </dl>
    </div>}
    {summary.blockers.length > 0 && <ul className={s.list} aria-label={t("Pendiente antes de cerrar", "Pending before closing")}>{summary.blockers.map((b, i) =>
      <li key={i} data-blocker={b.code}>{pick(lang, ...CLOSE_BLOCKER_TEXT[b.code])}{"line" in b ? ` (${b.line})` : ""}</li>)}</ul>}
    <form action={closeSaleFromQuote} className={s.inline}>
      <input type="hidden" name="quote_id" value={quote.id} />
      <input type="hidden" name="version_no" value={quote.current_version} />
      <input type="hidden" name="nonce" value={randomUUID()} />
      <button className={`${s.button} ${s.primary}`} disabled={summary.blockers.length > 0}>{t("Cerrar venta", "Close sale")}</button>
      <span className={s.muted}>{t("Operación única: repetirla devuelve la misma venta.", "Single operation: repeating it returns the same sale.")}</span>
    </form>
  </section>;
}
