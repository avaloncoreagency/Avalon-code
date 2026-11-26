import { loadOwnerDirectory } from "@/lib/identity/directory";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { money } from "@/lib/sales/domain";
import { QUOTE_TRANSITIONS, NOTE_REQUIRED, REVISABLE, acceptanceBlockers, isQuoteContent, missingVariableTerms, quoteFileName, type QuoteContent, type QuoteStatus } from "@/lib/quotes/model";
import { VARIABLE_FIELD_LABEL } from "@/lib/sales/quote-close";
import { ERROR_TEXT, OK_TEXT, STATUS_LABEL, STATUS_TONE, TRANSITION_UI } from "@/lib/quotes/text";
import { ReviewBeforeDownload } from "@/components/quotes/review-download";
import { linkVerifiedContract, deleteQuote, transitionQuote } from "../actions";
import { DeleteQuoteButton } from "@/components/quotes/delete-quote";
import { quoteSoftDeleteReady } from "@/lib/quotes/soft-delete";
import { QuoteUnavailable } from "@/components/quotes/unavailable";
import { QuoteClosePanel } from "@/components/sales/quote-close-panel";
import s from "@/components/sales/sales.module.css";
import w from "@/components/quotes/quotes.module.css";
import g from "@/components/sales/quote-path.module.css";

export const dynamic = "force-dynamic";
type Quote = { id: string; quote_number: string; title: string; status: QuoteStatus; current_version: number; valid_until: string; version: number;
  lead_id: string; client_id: string | null; sent_at: string | null; accepted_at: string | null; created_at: string;
  crm_leads: { company: string } | null; crm_clients: { legal_name: string } | null };
type Version = { id: string; version_no: number; content: QuoteContent; internal: { directCosts?: string; marginNote?: string; confidential?: string };
  one_time_total: string; monthly_total: string; commission_status: string | null; commission_pct: string | null; change_note: string; created_by: string; created_at: string };
type Event = { id: string; version_no: number; from_status: string | null; to_status: QuoteStatus; note: string; actor_id: string; created_at: string };

export default async function QuoteDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const quoteR = await run<Quote | null>(supabase.from("crm_quotes")
    .select("id,quote_number,title,status,current_version,valid_until,version,lead_id,client_id,sent_at,accepted_at,created_at,crm_leads(company),crm_clients(legal_name)").eq("id", id).maybeSingle());
  if (quoteR.error) return <Suite active="crm"><div className={s.hud}><QuoteUnavailable lang={lang} code={quoteR.error} /></div></Suite>;
  const quote = quoteR.data;
  if (!quote) notFound();
  // Logical deletion (migration 20261124110000): optional; a deleted quote is shown read-only with a clear banner.
  const canDelete = await quoteSoftDeleteReady(supabase);
  const deletedR = canDelete ? await supabase.from("crm_quotes").select("deleted_at,delete_reason").eq("id", quote.id).maybeSingle() : null;
  const deleted = (deletedR?.data as { deleted_at: string | null; delete_reason: string } | null)?.deleted_at ? deletedR!.data as { deleted_at: string; delete_reason: string } : null;
  // A prospect registered as a client after the quote was issued is resolved through its opportunity.
  if (!quote.client_id) {
    const linked = await run<{ id: string; legal_name: string } | null>(supabase.from("crm_clients").select("id,legal_name").eq("origin_lead_id", quote.lead_id).neq("status", "archived").limit(1).maybeSingle());
    if (linked.data) { quote.client_id = linked.data.id; quote.crm_clients = { legal_name: linked.data.legal_name }; }
  }
  const [versionsR, eventsR, owners, contractsR] = await Promise.all([
    run<Version[]>(supabase.from("crm_quote_versions").select("id,version_no,content,internal,one_time_total,monthly_total,commission_status,commission_pct,change_note,created_by,created_at")
      .eq("quote_id", id).order("version_no", { ascending: false })),
    run<Event[]>(supabase.from("crm_quote_events").select("id,version_no,from_status,to_status,note,actor_id,created_at").eq("quote_id", id).order("created_at", { ascending: false }).limit(100)),
    run<{ user_id: string; email: string }[]>(loadOwnerDirectory(supabase)),
    quote.client_id ? run<{ id: string; created_at: string; quote_version_id: string | null }[]>(supabase.from("crm_client_agreement_drafts")
      .select("id,created_at,quote_version_id").eq("client_id", quote.client_id).not("quote_version_id", "is", null).order("created_at", { ascending: false }).limit(20))
      : Promise.resolve({ data: [] as { id: string; created_at: string; quote_version_id: string | null }[], error: null, count: 0 } as const),
  ]);
  const versions = versionsR.data ?? [];
  const cur = versions.find(v => v.version_no === quote.current_version);
  const ownerList = owners.data ?? [];
  const content = cur && isQuoteContent(cur.content) ? cur.content : null;
  const okCode = q(p, "ok"), errCode = q(p, "error");
  const ok = okCode && Object.hasOwn(OK_TEXT, okCode) ? OK_TEXT[okCode] : null;
  const err = errCode ? (Object.hasOwn(ERROR_TEXT, errCode) ? ERROR_TEXT[errCode] : ERROR_TEXT.save) : null;
  const pdf = (v: number, inline: boolean) => `/admin/workspace/crm/quotes/${id}/pdf?v=${v}${inline ? "&view=inline" : ""}`;
  const verifiedContracts = quote.status === "accepted" ? await supabase.from("crm_contracts").select("id,title,verified_quote_revision")
    .eq("lead_id",quote.lead_id).eq("status","verified_signed") : null;
  const downloadable = ["approved", "sent", "accepted"].includes(quote.status);
  const today = new Date().toISOString().slice(0, 10);
  const blockers = content ? acceptanceBlockers(content) : [];
  const versionIds = new Set(versions.map(v => v.id));
  const contracts = (contractsR.data ?? []).filter(c => c.quote_version_id && versionIds.has(c.quote_version_id));
  const who = quote.client_id && quote.crm_clients ? <Link href={`/admin/workspace/crm/clients/${quote.client_id}`}>{quote.crm_clients.legal_name}</Link>
    : <Link href={`/admin/workspace/crm/lead/${quote.lead_id}`}>{quote.crm_leads?.company ?? "—"}</Link>;

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="quotes" eyebrow={`${pick(lang, "Cotización", "Quote")} ${quote.quote_number} · v${quote.current_version}`} title={quote.title}
      lead={pick(lang, "Una cotización no es un contrato ni una venta. Cada cambio crea una revisión nueva; lo enviado no se modifica.", "A quote is neither an agreement nor a sale. Every change creates a new revision; what was sent is never altered.")}
      actions={<>
        {REVISABLE.includes(quote.status) && <Link className={`${s.button} ${s.primary}`} href={`/admin/workspace/crm/quotes/${id}/edit`}>{pick(lang, "Editar (nueva revisión)", "Edit (new revision)")}</Link>}
        <Link className={s.button} href={`/admin/workspace/crm/quotes/new?lead=${quote.lead_id}`}>{pick(lang, "Nueva cotización", "New quote")}</Link>
        <a className={`${s.button} ${quote.status === "accepted" ? s.primary : ""}`} href="#close-sale">{pick(lang, "Cerrar venta", "Close sale")}</a>
        {downloadable && <a className={s.button} href={pdf(quote.current_version, true)} target="_blank" rel="noopener">{pick(lang, "Imprimir", "Print")}</a>}
        {canDelete && !deleted && quote.status !== "accepted" && <DeleteQuoteButton className={s.button} lang={lang} action={deleteQuote} quote={{ id: quote.id, version: quote.version,
          number: quote.quote_number, client: quote.crm_clients?.legal_name ?? quote.crm_leads?.company ?? "—", date: formatDate(lang, quote.created_at),
          total: cur ? `${money(lang, cur.one_time_total)} + ${money(lang, cur.monthly_total)}/${pick(lang, "mes", "mo")}${cur.commission_status === "proposed" ? ` + ${cur.commission_pct}%` : ""}` : "—",
          status: pick(lang, ...STATUS_LABEL[quote.status]) }} />}
      </>} />
    {deleted && <p className={s.flash} data-tone="warn" role="status" data-quote-deleted>{pick(lang, "Cotización eliminada (archivada) el", "Quote deleted (archived) on")} {formatDate(lang, deleted.deleted_at)}{deleted.delete_reason ? ` — ${deleted.delete_reason}` : ""}. {pick(lang, "Se conserva solo para consulta y auditoría.", "Kept for reference and audit only.")}</p>}
    {ok && <p className={s.flash} data-tone="ok" role="status">{pick(lang, ...ok)}</p>}
    {err && <p className={s.flash} data-tone="error" role="alert">{pick(lang, ...err)}</p>}

    <section className={s.stats} aria-label={pick(lang, "Resumen", "Summary")}>
      <div className={s.stat}><span>{pick(lang, "Estado", "Status")}</span><strong><span className={s.tag} data-tone={STATUS_TONE[quote.status]}>{pick(lang, ...STATUS_LABEL[quote.status])}</span></strong>
        <small>{quote.status === "sent" && quote.valid_until < today ? pick(lang, "Vencida: da seguimiento o márcala como vencida", "Overdue: follow up or mark as expired") : <>{pick(lang, "Para", "For")} {who}</>}</small></div>
      <div className={s.stat}><span>{pick(lang, "Pago único", "One-time")}</span><strong>{cur ? money(lang, cur.one_time_total) : "—"}</strong></div>
      <div className={s.stat}><span>{pick(lang, "Mensual", "Monthly")}</span><strong>{cur ? money(lang, cur.monthly_total) : "—"}</strong></div>
      <div className={s.stat}><span>{pick(lang, "Comisión", "Commission")}</span><strong>{!cur?.commission_status ? "—" : cur.commission_status === "proposed" ? cur.commission_pct + "%" : pick(lang, "Por acordar", "To be agreed")}</strong></div>
      <div className={s.stat}><span>{pick(lang, "Válida hasta", "Valid until")}</span><strong>{formatDate(lang, quote.valid_until)}</strong></div>
    </section>

    {content && <QuoteClosePanel db={supabase} lang={lang} quote={quote} content={content} closeError={q(p, "close_error")} resume={Boolean(okCode?.startsWith("status_") || okCode === "revised" || errCode || q(p, "close_error"))} />}
    {quote.status === "accepted" && <section className={s.panel} aria-labelledby="next-contract">
      {cur && !!verifiedContracts?.data?.length && <form className={s.form} action={linkVerifiedContract}>
        <input type="hidden" name="quote_id" value={quote.id}/><input type="hidden" name="revision" value={cur.id}/>
        <label>{pick(lang,"Contrato firmado y verificado","Verified signed contract")}<select name="contract_id" required>
          {verifiedContracts.data.filter(c => !c.verified_quote_revision || c.verified_quote_revision===cur.id).map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <label><input name="matched" type="checkbox" value="yes" required/> {pick(lang,"Verifiqué que los términos firmados coinciden con esta revisión aceptada.","I verified that the signed terms match this accepted revision.")}</label>
        <button className={s.button}>{pick(lang,"Vincular esta revisión","Link this revision")}</button></form>}
      <header><h2 id="next-contract">{pick(lang, "Siguiente paso: contrato", "Next step: agreement")}</h2></header>
      {contracts.length > 0 && <p className={s.flash} data-tone="ok">{pick(lang, "Ya existe un borrador de contrato basado en esta cotización.", "An agreement draft based on this quote already exists.")}{" "}
        <Link href={`/admin/workspace/crm/clients/${quote.client_id}/contracts`}>{pick(lang, "Ver contratos", "View agreements")}</Link></p>}
      {quote.client_id ? <p><Link className={`${s.button} ${s.primary}`} href={`/admin/workspace/crm/clients/${quote.client_id}/contracts?quote=${id}`}>{pick(lang, "Crear contrato desde cotización", "Create agreement from quote")}</Link></p>
        : <p className={s.flash} data-tone="warn">{pick(lang, "Este prospecto aún no está registrado como cliente. Regístralo desde su ficha (Clients 360) y vuelve aquí para crear el contrato; la cotización quedará vinculada automáticamente.", "This prospect is not registered as a client yet. Register it from its record (Clients 360) and come back to create the agreement; the quote links automatically.")}{" "}
          <Link href={`/admin/workspace/crm/lead/${quote.lead_id}`}>{pick(lang, "Abrir oportunidad", "Open opportunity")}</Link></p>}
      <p className={s.muted}>{pick(lang, "Aceptar una cotización no registra una venta. La venta se confirma después, con el contrato verificado.", "Accepting a quote does not record a sale. The sale is confirmed later, with the verified agreement.")}</p>
    </section>}

    <section className={s.panel} aria-labelledby="quote-actions">
      <details className={g.summary} open={!content || undefined}><summary id="quote-actions">{pick(lang, "Más acciones y correcciones", "More actions and corrections")}</summary><div className={g.detailBody}>
      {QUOTE_TRANSITIONS[quote.status].length === 0 ? <p className={s.muted}>{pick(lang, "Estado final: esta cotización ya no cambia. Para nuevas condiciones crea una nueva cotización.", "Final state: this quote no longer changes. For new terms create a new quote.")}</p> :
        <div className={w.actionsGrid}>{QUOTE_TRANSITIONS[quote.status].map(to => {
          const ui = TRANSITION_UI[to]; if (!ui) return null;
          const incomplete = blockers.includes("variable_terms_incomplete") && ["approved", "sent", "accepted"].includes(to);
          const blocked = incomplete || (to === "accepted" && (blockers.length > 0 || quote.valid_until < today));
          return <form key={to} action={transitionQuote}>
            <input type="hidden" name="quote_id" value={id} /><input type="hidden" name="expected_version" value={quote.version} /><input type="hidden" name="to" value={to} />
            {NOTE_REQUIRED.includes(to) && ui.note && <label className={s.field}>{pick(lang, ...ui.note)}<textarea name="note" required minLength={8} maxLength={1000} rows={2} /></label>}
            {blocked && <small className={w.hint} data-blocked-transition={to}>{incomplete && content?.commission
              ? `${pick(lang, ...ERROR_TEXT.quote_variable_terms_incomplete)} ${missingVariableTerms(content.commission).map(f => pick(lang, ...VARIABLE_FIELD_LABEL[f])).join(" · ")}`
              : blockers.includes("commission_to_negotiate") ? pick(lang, ...ERROR_TEXT.quote_commission_to_negotiate) : pick(lang, ...ERROR_TEXT.quote_expired)}</small>}
            <button type="submit" className={`${s.button} ${to === "accepted" || to === "approved" ? s.primary : ""}`} disabled={blocked}>{pick(lang, ...ui.label)}</button>
          </form>;
        })}</div>}
      </div></details>
    </section>

    <section className={s.panel} aria-labelledby="quote-pdf">
      <header><h2 id="quote-pdf">{pick(lang, "Vista previa del PDF", "PDF preview")} · v{quote.current_version}</h2>
        <a className={s.button} href={pdf(quote.current_version, true)} target="_blank" rel="noopener">{pick(lang, "Abrir en pestaña nueva", "Open in new tab")}</a></header>
      {content ? <p className={s.muted}>{pick(lang, "Abre el PDF solo cuando quieras revisar o imprimir esta versión. La vista previa no interrumpe el cierre de la venta.", "Open the PDF only when you want to review or print this version. The preview does not interrupt the sales workflow.")}</p> :
        <p className={s.flash} data-tone="error">{pick(lang, "No se pudo leer esta revisión.", "This revision could not be read.")}</p>}
      {downloadable ? <ReviewBeforeDownload lang={lang} href={pdf(quote.current_version, false)} fileName={quoteFileName(quote.quote_number, quote.current_version)} />
        : <p className={s.muted}>{pick(lang, "La descarga para el cliente se habilita cuando esta revisión está aprobada internamente.", "The client download is enabled once this revision is approved internally.")}</p>}
    </section>

    {cur && <section className={s.panel} aria-labelledby="quote-internal">
      <header><h2 id="quote-internal">{pick(lang, "Información interna de Avalon", "Avalon internal information")}</h2><span className={s.tag} data-tone="warn">{pick(lang, "No aparece en el PDF", "Not in the PDF")}</span></header>
      {!cur.internal?.directCosts && !cur.internal?.marginNote && !cur.internal?.confidential ? <p className={s.muted}>{pick(lang, "Sin notas internas en esta revisión.", "No internal notes in this revision.")}</p> :
        <dl className={w.review}>
          {cur.internal.directCosts && <div><dt>{pick(lang, "Costos directos", "Direct costs")}</dt><dd>{cur.internal.directCosts}</dd></div>}
          {cur.internal.marginNote && <div><dt>{pick(lang, "Margen y contingencia", "Margin and contingency")}</dt><dd>{cur.internal.marginNote}</dd></div>}
          {cur.internal.confidential && <div><dt>{pick(lang, "Notas confidenciales", "Confidential notes")}</dt><dd>{cur.internal.confidential}</dd></div>}
        </dl>}
    </section>}

    <section className={s.panel} aria-labelledby="quote-versions">
      <header><h2 id="quote-versions">{pick(lang, "Versiones", "Versions")}</h2></header>
      {versionsR.error ? <QuoteUnavailable lang={lang} code={versionsR.error} /> : <ul className={w.versions}>{versions.map(v => <li key={v.id}>
        <span><strong>v{v.version_no}</strong>{v.version_no === quote.current_version ? " · " + pick(lang, "actual", "current") : ""} · {formatDate(lang, v.created_at)} · {ownerName(ownerList, v.created_by)}
          {v.change_note ? <><br /><small>{v.change_note}</small></> : null}</span>
        <span>{money(lang, v.one_time_total)} + {money(lang, v.monthly_total)}/{pick(lang, "mes", "mo")} · <a href={pdf(v.version_no, true)} target="_blank" rel="noopener">{pick(lang, "Ver PDF", "View PDF")}</a></span>
      </li>)}</ul>}
    </section>

    <section className={s.panel} aria-labelledby="quote-history">
      <header><h2 id="quote-history">{pick(lang, "Historial", "History")}</h2></header>
      {eventsR.error ? <QuoteUnavailable lang={lang} code={eventsR.error} /> : <ol className={s.timeline}>{(eventsR.data ?? []).map(e => <li key={e.id}>
        <strong>{e.from_status ? pick(lang, ...STATUS_LABEL[e.from_status as QuoteStatus]) + " → " : ""}{pick(lang, ...STATUS_LABEL[e.to_status])}</strong> · v{e.version_no} · {formatDate(lang, e.created_at)} · {ownerName(ownerList, e.actor_id)}
        {e.note && <><br /><small>{e.note}</small></>}
      </li>)}</ol>}
    </section>
  </div></Suite>;
}
