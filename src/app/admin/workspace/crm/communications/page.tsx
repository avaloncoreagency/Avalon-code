import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { OUTBOX_KIND, OUTBOX_STATUS } from "@/lib/onboarding/text";
import { smtpConfig } from "@/lib/comms/transport";
import { loadCompany } from "@/lib/comms/company-server";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

type Row = { id: string; kind: string; status: string; to_email: string; to_name: string; from_email: string; subject: string; attempts: number; error: string;
  provider: string | null; provider_message_id: string | null; sent_at: string | null; created_at: string; onboarding_id: string | null; client_id: string;
  attachments: unknown[]; crm_clients: { legal_name: string; trade_name: string } | null };
const STATUSES = ["prepared", "approved", "failed", "blocked_no_transport", "sent", "cancelled"] as const;

/**
 * CRM → Communication Center (AVL-COMMS-FINAL-001 · M09). OWNERS ONLY. A read view over the ONE existing outbox
 * (crm_email_outbox): history, recipient, documents, status, errors, attempts and send evidence for every client.
 * Preparing, approving, sending, retrying and recording manual sends stay in each onboarding (frozen content, owner
 * approval, compare-and-set send): this page never sends and is not a second engine or inbox.
 */
export default async function CommunicationCenter({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang(); const p = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const status = q(p, "status") ?? "";
  let query = supabase.from("crm_email_outbox")
    .select("id,kind,status,to_email,to_name,from_email,subject,attempts,error,provider,provider_message_id,sent_at,created_at,onboarding_id,client_id,attachments,crm_clients(legal_name,trade_name)")
    .order("created_at", { ascending: false }).limit(200);
  if ((STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  const [{ data, error }, company] = await Promise.all([query, loadCompany(supabase)]);
  const rows = (data ?? []) as unknown as Row[];
  const smtp = smtpConfig();
  const transport = { ok: smtp.configured && smtp.user === company.contact.clientSender.toLowerCase() };
  const count = (st: string) => rows.filter(r => r.status === st).length;
  return <Suite active="crm"><div className={s.hud} data-communication-center>
    <OpsHeader lang={lang} active="clients" eyebrow={t("CRM / Comunicaciones", "CRM / Communications")} title={t("Communication Center", "Communication Center")}
      lead={t("Historial de todos los correos a clientes: destinatario, documentos, estado, errores y evidencia. La preparación, aprobación, envío y reintento se hacen en el onboarding de cada cliente.",
        "History of every client e-mail: recipient, documents, status, errors and evidence. Preparing, approving, sending and retrying happen in each client's onboarding.")} />
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
          </li>;
        })}</ul>}
    </section>
  </div></Suite>;
}
