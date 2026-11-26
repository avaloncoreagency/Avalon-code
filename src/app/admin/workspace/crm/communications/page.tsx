import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { ONBOARDING_ERROR, ONBOARDING_OK, OUTBOX_KIND, OUTBOX_STATUS } from "@/lib/onboarding/text";
import { COMMERCIAL_KINDS } from "@/lib/comms/email";
import { prepareCommercialEmail } from "./actions";
import { approveAndSend, recordManualSend } from "../onboarding/actions";
import { smtpConfig } from "@/lib/comms/transport";
import { loadCompany } from "@/lib/comms/company-server";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type Row = { id: string; kind: string; status: string; to_email: string; to_name: string; from_email: string; subject: string; attempts: number; error: string;
  provider: string | null; provider_message_id: string | null; sent_at: string | null; created_at: string; onboarding_id: string | null; client_id: string;
  attachments: unknown[]; body_text: string; crm_clients: { legal_name: string; trade_name: string } | null };
type Source = { value: string; label: string };
const STATUSES = ["prepared", "approved", "failed", "blocked_no_transport", "sent", "cancelled"] as const;

/**
 * CRM → Communication Center (AVL-COMMS-FINAL-001 · M09, AVL-CLAUDE-CONVERGENCE-001). OWNERS ONLY. A view over the ONE
 * existing outbox (crm_email_outbox): history, recipient, documents, status, errors, attempts and send evidence for every
 * client. Onboarding messages are prepared in each onboarding; commercial messages (quote, contract, payment,
 * subscription) are prepared here from recorded facts. Approval and sending always use the same canonical
 * compare-and-set flow (approveAndSend / recordManualSend): this page has no transport and is not a second engine.
 */
export default async function CommunicationCenter({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang(); const p = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const status = q(p, "status") ?? "";
  let query = supabase.from("crm_email_outbox")
    .select("id,kind,status,to_email,to_name,from_email,subject,attempts,error,provider,provider_message_id,sent_at,created_at,onboarding_id,client_id,attachments,body_text,crm_clients(legal_name,trade_name)")
    .order("created_at", { ascending: false }).limit(200);
  if ((STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  // Recorded facts that can back a commercial message (each source is re-validated server-side when preparing).
  const [{ data, error }, company, quotes, contracts, payments, subs, contacts] = await Promise.all([query, loadCompany(supabase),
    supabase.from("crm_quotes").select("id,quote_number,title,status").in("status", ["approved", "sent"]).order("updated_at", { ascending: false }).limit(50),
    supabase.from("crm_contracts").select("id,title").eq("status", "verified_signed").order("verified_at", { ascending: false }).limit(50),
    supabase.from("crm_payments").select("id,amount,currency,received_on").eq("status", "verified").order("received_on", { ascending: false }).limit(50),
    supabase.from("crm_subscriptions").select("id,status,cancel_at_period_end,crm_service_catalog(name),crm_clients(legal_name,trade_name)").in("status", ["active", "suspended", "cancelled"]).order("updated_at", { ascending: false }).limit(50),
    supabase.from("crm_contacts").select("id,full_name,email,crm_clients(legal_name,trade_name)").not("email", "is", null).order("full_name").limit(300)]);
  const sources: Record<string, Source[]> = {
    quote_sent: ((quotes.data ?? []) as { id: string; quote_number: string; title: string }[]).map(x => ({ value: x.id, label: `${x.quote_number} · ${x.title}` })),
    contract_confirmation: ((contracts.data ?? []) as { id: string; title: string }[]).map(x => ({ value: x.id, label: x.title })),
    payment_confirmation: ((payments.data ?? []) as { id: string; amount: string; currency: string; received_on: string }[]).map(x => ({ value: x.id, label: `${x.currency} ${x.amount} · ${x.received_on}` })),
    subscriptions: ((subs.data ?? []) as unknown as { id: string; status: string; cancel_at_period_end: boolean; crm_service_catalog: { name: string } | null; crm_clients: { legal_name: string; trade_name: string } | null }[])
      .map(x => ({ value: x.id, label: `${x.crm_service_catalog?.name ?? "—"} · ${x.crm_clients ? (x.crm_clients.trade_name || x.crm_clients.legal_name) : "—"} · ${x.status}${x.cancel_at_period_end ? " (fin de período)" : ""}` })),
  };
  const contactOptions = ((contacts.data ?? []) as unknown as { id: string; full_name: string; email: string; crm_clients: { legal_name: string; trade_name: string } | null }[]);
  const okMsg = q(p, "ok"), errMsg = q(p, "error");
  const rows = (data ?? []) as unknown as Row[];
  const smtp = smtpConfig();
  const transport = { ok: smtp.configured && smtp.user === company.contact.clientSender.toLowerCase() };
  const count = (st: string) => rows.filter(r => r.status === st).length;
  return <Suite active="crm"><div className={s.hud} data-communication-center>
    <OpsHeader lang={lang} active="clients" eyebrow={t("CRM / Comunicaciones", "CRM / Communications")} title={t("Communication Center", "Communication Center")}
      lead={t("Historial de todos los correos a clientes: destinatario, documentos, estado, errores y evidencia. Los correos de onboarding se gestionan en cada onboarding; los comerciales, aquí. Todos se aprueban antes de enviarse.",
        "History of every client e-mail: recipient, documents, status, errors and evidence. Onboarding e-mails are handled in each onboarding; commercial ones here. All are approved before sending.")} />
    {okMsg && ONBOARDING_OK[okMsg] && <p role="status" className={s.flash}>{pick(lang, ...ONBOARDING_OK[okMsg])}</p>}
    {errMsg && <p role="alert" className={s.flash} data-tone="error">{pick(lang, ...(ONBOARDING_ERROR[errMsg] ?? ["No se pudo completar la acción.", "The action could not be completed."]))}</p>}
    <section className={s.panel} aria-labelledby="commercial-prepare">
      <h2 id="commercial-prepare">{t("Preparar correo comercial", "Prepare a commercial e-mail")}</h2>
      <p className={s.muted}>{t("Solo desde un hecho registrado: cotización aprobada o enviada, contrato verificado, pago verificado o suscripción. Se prepara congelado; nada se envía sin tu aprobación.",
        "Only from a recorded fact: approved or sent quote, verified contract, verified payment or subscription. It is prepared frozen; nothing is sent without your approval.")}</p>
      <form action={prepareCommercialEmail} className={s.form} data-commercial-form>
        <label className={s.field}>{t("Tipo", "Type")} <select name="kind" required defaultValue="">
          <option value="" disabled>{t("Seleccionar", "Select")}</option>
          {COMMERCIAL_KINDS.map(k => <option key={k} value={k}>{pick(lang, ...(OUTBOX_KIND[k] ?? [k, k]))}</option>)}
        </select></label>
        <label className={s.field}>{t("Registro", "Record")} <select name="source_id" required defaultValue="">
          <option value="" disabled>{t("Seleccionar", "Select")}</option>
          <optgroup label={t("Cotizaciones", "Quotes")}>{sources.quote_sent.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          <optgroup label={t("Contratos verificados", "Verified contracts")}>{sources.contract_confirmation.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          <optgroup label={t("Pagos verificados", "Verified payments")}>{sources.payment_confirmation.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
          <optgroup label={t("Suscripciones", "Subscriptions")}>{sources.subscriptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
        </select></label>
        <label className={s.field}>{t("Contacto", "Contact")} <select name="contact_id" required defaultValue="">
          <option value="" disabled>{t("Seleccionar", "Select")}</option>
          {contactOptions.map(c => <option key={c.id} value={c.id}>{c.full_name} · {c.crm_clients ? (c.crm_clients.trade_name || c.crm_clients.legal_name) : ""}</option>)}
        </select></label>
        <label className={s.field}>{t("Idioma", "Language")} <select name="lang" defaultValue={lang}><option value="es">Español</option><option value="en">English</option></select></label>
        <label className={s.field}>{t("Nota opcional", "Optional note")} <textarea name="note" maxLength={1000} rows={2} /></label>
        <button className={s.button} type="submit">{t("Preparar", "Prepare")}</button>
      </form>
    </section>
    <section className={s.panel}>
      <p data-transport={transport.ok ? "ready" : "blocked"}>{transport.ok
        ? t(`Envío automático disponible desde ${company.contact.clientSender}.`, `Automatic sending available from ${company.contact.clientSender}.`)
        : t(`Envío automático BLOQUEADO: falta configurar en Vercel el SMTP de ${company.contact.clientSender} (AVALON_SMTP_*). Puedes preparar, enviar desde Gmail y registrar la evidencia.`,
            `Automatic sending BLOCKED: SMTP for ${company.contact.clientSender} is not configured in Vercel (AVALON_SMTP_*). You can prepare, send from Gmail and record the evidence.`)}</p>
      <p className={s.muted}>{t("«Enviado» significa que el servidor SMTP aceptó el mensaje; no confirma que llegó a la bandeja del destinatario.", "“Sent” means the SMTP server accepted the message; it does not confirm it reached the recipient's inbox.")}</p>
      <nav aria-label={t("Filtrar por estado", "Filter by status")}>
        <Link href="/admin/workspace/crm/communications" aria-current={!status ? "page" : undefined}>{t("Todos", "All")} ({rows.length})</Link>
        {STATUSES.map(st => <span key={st}> · <Link href={`/admin/workspace/crm/communications?status=${st}`} aria-current={status === st ? "page" : undefined}>
          {pick(lang, ...(OUTBOX_STATUS[st] ?? [st, st])).split(" · ")[0]}{!status ? ` (${count(st)})` : ""}</Link></span>)}
      </nav>
    </section>
    <section className={s.panel}>
      {error ? <p role="alert">{t("No se pudo cargar el historial.", "The history could not be loaded.")}</p>
        : !rows.length ? <p className={s.muted}>{t("Todavía no hay correos preparados.", "No e-mails prepared yet.")}</p>
        : <ul style={{ listStyle: "none", padding: 0 }}>{rows.map(m => {
          const client = m.crm_clients ? (m.crm_clients.trade_name || m.crm_clients.legal_name) : "—";
          const docs = Array.isArray(m.attachments) ? m.attachments.length : 0;
          return <li key={m.id} data-outbox-row={m.status} style={{ display: "block", padding: "10px 0", borderBottom: "1px solid var(--line, #e1e5ef)" }}>
            <strong>{m.subject}</strong> · <span className={s.tag} data-tone={m.status === "sent" ? "ok" : m.status === "failed" ? "danger" : "warn"}>{pick(lang, ...(OUTBOX_STATUS[m.status] ?? [m.status, m.status]))}</span>
            <br /><small className={s.muted}>{pick(lang, ...(OUTBOX_KIND[m.kind] ?? [m.kind, m.kind]))} · {client} · {t("para", "to")} {m.to_name} &lt;{m.to_email}&gt; · {t("desde", "from")} {m.from_email}
              {docs ? ` · ${docs} ${t("adjunto(s)", "attachment(s)")}` : ""} · {t("intentos", "attempts")} {m.attempts} · {formatDate(lang, m.created_at, true)}</small>
            {m.status === "sent" && <><br /><small className={s.muted}>{t("Evidencia", "Evidence")}: {m.provider === "manual" ? t("envío manual registrado", "manual send recorded") : m.provider} · {m.provider_message_id ?? "—"} · {m.sent_at ? formatDate(lang, m.sent_at, true) : ""}</small></>}
            {m.error && m.status !== "sent" && <><br /><small role="note">{t("Error", "Error")}: <code>{m.error}</code></small></>}
            {m.onboarding_id && <><br /><Link href={`/admin/workspace/crm/onboarding/${m.onboarding_id}#emails`}>{t("Previsualizar, aprobar, enviar o reintentar", "Preview, approve, send or retry")}</Link></>}
            {!m.onboarding_id && ["prepared", "approved", "failed", "blocked_no_transport"].includes(m.status) && m.attempts < 5 && <div data-commercial-actions>
              <details><summary>{t("Vista previa", "Preview")}</summary><pre style={{ whiteSpace: "pre-wrap", font: "inherit" }}>{m.body_text}</pre></details>
              <form action={approveAndSend} className={s.inline}><input type="hidden" name="message_id" value={m.id} />
                <button className={s.button} type="submit">{t("Aprobar y enviar", "Approve and send")}</button></form>
              <form action={recordManualSend} className={s.inline}><input type="hidden" name="message_id" value={m.id} />
                <label className={s.field}>{t("Evidencia de envío manual", "Manual send evidence")} <input name="evidence" minLength={10} maxLength={300} required /></label>
                <button className={s.button} type="submit">{t("Registrar envío manual", "Record manual send")}</button></form>
            </div>}
          </li>;
        })}</ul>}
    </section>
  </div></Suite>;
}
