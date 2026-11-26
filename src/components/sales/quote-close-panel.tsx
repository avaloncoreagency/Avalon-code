import { randomUUID } from "node:crypto";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { formatUsd, type QuoteContent } from "@/lib/quotes/model";
import { BASE_LABEL, CLOSE_BLOCKER_TEXT, VARIABLE_FIELD_LABEL, VARIABLE_KIND_LABEL, closeSummary, type CatalogEntry } from "@/lib/sales/quote-close";
import { QUOTE_TRANSITIONS, REVISABLE, type QuoteStatus } from "@/lib/quotes/model";
import { TRANSITION_UI } from "@/lib/quotes/text";
import { transitionQuote } from "@/app/admin/workspace/crm/quotes/actions";
import { closeSaleFromQuote } from "@/app/admin/workspace/crm/sales/actions";
import s from "./sales.module.css";
import g from "./quote-path.module.css";
import { PathEvidence, PathResume, PathSubmit } from "./quote-path-controls";

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
export async function QuoteClosePanel({ db, lang, quote, content, closeError, resume = false }: {
  db: SupabaseClient; lang: Lang; content: QuoteContent; closeError?: string | null; resume?: boolean;
  quote: { id: string; status: string; current_version: number; version: number; lead_id: string; client_id?: string | null; valid_until: string; accepted_at: string | null; quote_number: string };
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
  const head = <header><h2 id="close-sale">{t("Camino a la venta · Cerrar venta", "Path to sale · Close sale")}</h2></header>;
  if (sale.data) return <section className={s.panel} aria-labelledby="close-sale" data-close-state="closed">{head}
    <p className={s.flash} data-tone="ok">{t("Esta cotización ya se cerró como venta.", "This quote was already closed as a sale.")}{" "}
      <Link href={`/admin/workspace/crm/sales/${sale.data.id}`}>{t("Ver venta", "View sale")} {sale.data.sale_number} →</Link></p></section>;
  const status = quote.status as QuoteStatus;
  if (["rejected", "expired", "superseded"].includes(status)) return <section className={s.panel} aria-labelledby="close-sale" data-close-state="final">{head}
    <p className={s.flash} data-tone="warn">{t("Esta cotización está cerrada (rechazada, vencida o reemplazada) y no puede convertirse en venta. Para nuevas condiciones crea una nueva cotización.",
      "This quote is closed (rejected, expired or superseded) and cannot become a sale. For new terms create a new quote.")}</p></section>;
  const termBlockers = summary.blockers.filter(b => b.code === "quote_variable_terms_incomplete" || b.code === "quote_commission_to_negotiate"
    || b.code === "quote_line_not_in_catalog" || b.code === "quote_line_kind_mismatch" || b.code === "quote_needs_service_line");
  const reached = (...st: QuoteStatus[]) => st.includes(status);
  const editHref = `/admin/workspace/crm/quotes/${quote.id}/edit`, contractHref = `/admin/workspace/crm/lead/${quote.lead_id}?tab=contract`;
  // Keep the canonical state machine and version guard. Only the next unfinished step is actionable.
  const steps: { key: string; done: boolean; label: [string, string] }[] = [
    { key: "terms", done: !termBlockers.length, label: ["Condiciones", "Terms"] },
    { key: "approved", done: reached("approved", "sent", "accepted"), label: ["Aprobación", "Approval"] },
    { key: "sent", done: reached("sent", "accepted"), label: ["Envío", "Send"] },
    { key: "accepted", done: reached("accepted"), label: ["Aceptación", "Acceptance"] },
    { key: "contract", done: !!contract.data, label: ["Contrato", "Agreement"] },
  ];
  const next = steps.find(x => !x.done);
  const target: QuoteStatus | undefined = next?.key === "approved"
    ? status === "draft" ? "internal_review" : status === "internal_review" ? "approved" : undefined
    : next?.key === "sent" ? "sent" : next?.key === "accepted" ? "accepted" : undefined;
  const transition = target && QUOTE_TRANSITIONS[status].includes(target) ? TRANSITION_UI[target] : undefined;
  const completed = steps.filter(x => x.done).length;
  const pathLabels: Partial<Record<QuoteStatus, [string, string]>> = {
    internal_review: ["Continuar a revisión", "Continue to review"],
    approved: ["Confirmar aprobación", "Confirm approval"],
    sent: ["Guardar registro de envío", "Save send record"],
    accepted: ["Guardar evidencia de aceptación", "Save acceptance evidence"],
  };

  const lookupFailed = Boolean(catalog.error || contract.error || sale.error || acceptance.error);
  const expired = status === "sent" && quote.valid_until < new Date().toISOString().slice(0, 10);
  const canClose = summary.blockers.length === 0 && !lookupFailed;
  const activeTitle = next?.key === "terms" ? t("Completa tu propuesta", "Complete your proposal")
    : target === "internal_review" ? t("Envía a revisión interna", "Submit for internal review")
    : target === "approved" ? t("Revisa y aprueba esta versión", "Review and approve this version")
    : target === "sent" ? t("¿Ya compartiste la propuesta?", "Have you shared the proposal?")
    : target === "accepted" ? t("¿El cliente aceptó?", "Did the client accept?")
    : next?.key === "contract" ? t("Prepara y verifica el contrato", "Prepare and verify the agreement")
    : t("Todo listo para cerrar", "Ready to close");
  const pdfHref = `/admin/workspace/crm/quotes/${quote.id}/pdf?v=${quote.current_version}&view=inline`;
  const newHref = `/admin/workspace/crm/quotes/new?lead=${quote.lead_id}`;
  const contractDraftHref = quote.client_id ? `/admin/workspace/crm/clients/${quote.client_id}/contracts?quote=${quote.id}` : null;

  return <section className={g.guide} aria-labelledby="close-sale" data-close-ready={canClose} data-close-state={canClose ? "ready" : "blocked"}>
    <header className={g.heading}>
      <div><p className={g.kicker}>{t("Asistente comercial", "Sales assistant")}</p><h2 id="close-sale">{t("Camino a la venta · Cerrar venta", "Path to sale · Close sale")}</h2></div>
      <span className={g.count} role="status">{completed} / {steps.length} {t("etapas completadas", "stages completed")}</span>
    </header>
    <progress className={g.progress} value={completed} max={steps.length} aria-label={t("Progreso del cierre", "Closing progress")} />
    <ol className={g.rail} aria-label={t("Pasos para cerrar la venta", "Steps to close the sale")}>{steps.map((x,i) =>
      <li key={x.key} data-step={x.key} data-done={x.done} data-next={next?.key === x.key || undefined} aria-current={next?.key === x.key ? "step" : undefined}>
        <span className={g.dot} aria-hidden="true">{x.done ? "✓" : i+1}</span><strong>{pick(lang,...x.label)}</strong>
        <small className={g.hint}>{x.done ? t("Listo","Done") : next?.key === x.key ? t("Ahora","Now") : t("Pendiente","Pending")}</small>
      </li>)}</ol>
    {errText && <p role="alert" className={s.flash} data-tone="error">{pick(lang, ...errText)}</p>}
    {lookupFailed && <p role="alert" className={g.notice}>{t("No se pudo comprobar todo el expediente. Recarga antes de cerrar la venta.", "The complete record could not be checked. Reload before closing the sale.")}</p>}
    <PathResume resume={resume} revision={quote.version} status={status} />
    <div className={g.active} data-path-active={next?.key ?? "close"}>
      <p className={g.kicker}>{next ? `${t("Paso", "Step")} ${steps.indexOf(next)+1} / ${steps.length}` : t("Confirmación final", "Final confirmation")}</p>
      <h3 id="quote-path-current" tabIndex={-1}>{activeTitle}</h3>
      {next?.key === "terms" && <>
        <p className={g.hint}>{t("Resuelve solo lo que falta. Al editar se conserva la versión anterior y se vuelve a revisar la nueva.", "Resolve only what is missing. Editing preserves the previous version and requires review of the new one.")}</p>
        <ul className={s.list} aria-label={t("Condiciones pendientes", "Missing terms")}>{termBlockers.map((b,i) =>
          <li key={i} data-blocker={b.code}>{pick(lang,...CLOSE_BLOCKER_TEXT[b.code])}{"line" in b ? ` (${b.line})` : ""}
            {"missing" in b && <ul>{b.missing.map(f => <li key={f} data-missing={f}>{pick(lang,...VARIABLE_FIELD_LABEL[f])}</li>)}</ul>}
          </li>)}</ul>
        {REVISABLE.includes(status) ? <a className={`${s.button} ${s.primary} ${g.cta}`} href={editHref}>{t("Editar cotización (nueva revisión)", "Edit quote (new revision)")}</a>
          : <a className={`${s.button} ${s.primary} ${g.cta}`} href={newHref}>{t("Crear nueva cotización", "Create new quote")}</a>}
      </>}
      {target && transition && <>
        {target === "internal_review" && <p className={g.hint}>{t("La versión actual queda lista para que un propietario revise sus condiciones. Todavía no se comparte con el cliente.", "The current version is ready for an owner to review its terms. It is not shared with the client yet.")}</p>}
        {target === "approved" && <p className={g.hint}>{t("Comprueba servicios, importes y condiciones antes de aprobar esta versión.", "Check services, amounts and terms before approving this version.")}</p>}
        {(target === "internal_review" || target === "approved") && <>
          <div className={g.links}><a className={s.button} href={pdfHref} target="_blank" rel="noopener">{t("Revisar propuesta PDF", "Review proposal PDF")}</a><a className={s.button} href={editHref}>{t("Corregir condiciones", "Correct terms")}</a></div>
          <form className={g.form} action={transitionQuote} data-path-transition={target}>
            <input type="hidden" name="quote_id" value={quote.id} />
            <input type="hidden" name="expected_version" value={quote.version} />
            <input type="hidden" name="to" value={target} />
            <PathSubmit lang={lang} label={pick(lang,...(pathLabels[target] ?? transition.label))} />
          </form>
        </>}
        {target === "sent" && <>
          <p className={g.hint}>{t("Si todavía no la compartiste, abre la propuesta desde aquí. Después registra cómo se envió.", "If you have not shared it yet, open the proposal here. Then record how it was sent.")}</p>
          <div className={g.links}><a className={s.button} href={pdfHref} target="_blank" rel="noopener">{t("Abrir propuesta para compartir", "Open proposal to share")}</a></div>
        </>}
        {target === "accepted" && <p className={g.hint}>{t("Guarda quién aceptó esta versión, cuándo y dónde quedó la prueba. No genera una venta ni un cobro.", "Save who accepted this version, when and where proof is stored. This does not create a sale or payment.")}</p>}
        {expired ? <><p role="alert" className={g.notice}>{t("La propuesta está vencida. Crea una nueva revisión comercial para obtener una aceptación válida.", "The proposal has expired. Create a new quote to obtain a valid acceptance.")}</p><a className={s.button} href={newHref}>{t("Crear nueva cotización", "Create new quote")}</a></>
          : (target === "sent" || target === "accepted") && <PathEvidence key={`${quote.id}:${quote.version}:${target}`} lang={lang} kind={target} label={pick(lang,...(pathLabels[target] ?? transition.label))} action={transitionQuote} quoteId={quote.id} version={quote.version} />}
      </>}
      {next?.key === "contract" && <>
        <p data-blocker="contract_not_verified" className={g.hint}>{t("La propuesta aceptada todavía necesita un contrato firmado y verificado. No se repiten los términos comerciales.", "The accepted proposal still needs a signed and verified agreement. Commercial terms are reused.")}</p>
        {contractDraftHref && <a className={`${s.button} ${s.primary} ${g.cta}`} href={contractDraftHref}>{t("Preparar contrato con esta cotización", "Prepare agreement from this quote")}</a>}
        <a className={s.button} href={contractHref}>{t("Abrir contrato de la oportunidad", "Open the opportunity agreement")}</a>
        <p className={g.hint}>{t("Usa el expediente contractual para registrar el documento real y su verificación; después vuelve a la cotización.", "Use the agreement record to log the real document and verification; then return to the quote.")}</p>
      </>}
      {!next && <p className={g.hint}>{t("Revisa el resumen y confirma el cierre. Se conserva la versión aceptada y no se cobra dinero desde este botón.", "Review the summary and confirm closing. The accepted revision is preserved and no money is collected by this button.")}</p>}
      <div className={g.snapshot} aria-label={t("Importes de referencia", "Reference amounts")}>
        <div><small>{t("Pago único", "One-time")}</small><strong>{formatUsd(summary.oneTimeCents,lang)}</strong></div>
        <div><small>{t("Mensual", "Monthly")}</small><strong>{formatUsd(summary.monthlyCents,lang)}</strong></div>
        {v && <div><small>{t("Variable", "Variable")}</small><strong>{v.pct}%</strong></div>}
      </div>
    </div>
    <details className={g.summary} open={status === "accepted" || undefined}><summary>{t("Resumen de condiciones y evidencia", "Terms and evidence summary")} · {quote.quote_number} v{quote.current_version}</summary><div className={g.detailBody}>
    <dl className={s.detail}>
      <div><dt>{t("Cliente", "Client")}</dt><dd>{content.client.company || "—"}{content.client.contact ? ` · ${content.client.contact}` : ""}</dd></div>
      <div><dt>{t("Modelo comercial", "Commercial model")}</dt><dd>{pick(lang, ...MODEL[content.model])}</dd></div>
      <div><dt>{status === "accepted" ? t("Versión aceptada", "Accepted version") : t("Versión actual (no aceptada)", "Current version (not accepted)")}</dt><dd>{quote.quote_number} v{quote.current_version}{quote.accepted_at ? ` · ${formatDate(lang, quote.accepted_at)}` : ""}</dd></div>
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
        <div><dt>{t("Vigencia", "Term")}</dt><dd>{v.effectiveDate ? `${t("desde", "from")} ${formatDate(lang, v.effectiveDate)}` : t("sin fecha de inicio (falta)", "no start date (missing)")}{v.durationMonths ? ` · ${v.durationMonths} ${t("meses", "months")}` : ""}</dd></div>
        {v.exclusions && <div><dt>{t("Exclusiones", "Exclusions")}</dt><dd>{v.exclusions}</dd></div>}
        {v.refunds && <div><dt>{t("Reembolsos", "Refunds")}</dt><dd>{v.refunds}</dd></div>}
      </dl>
    </div>}
    </div></details>
    <form action={closeSaleFromQuote} className={g.form}>
      <input type="hidden" name="quote_id" value={quote.id} />
      <input type="hidden" name="version_no" value={quote.current_version} />
      <input type="hidden" name="nonce" value={randomUUID()} />
      <PathSubmit lang={lang} label={t("Cerrar venta", "Close sale")} disabled={!canClose} />
      <span className={g.hint}>{canClose ? t("Operación única: repetirla devuelve la misma venta.", "Single operation: repeating it returns the same sale.") : t("Se habilita al completar las etapas y verificar el expediente.", "Enabled once the stages and record are verified.")}</span>
    </form>
  </section>;
}
