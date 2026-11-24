import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Badge } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { appOrigin, loadCompany, signerForUser } from "@/lib/comms/company-server";
import { smtpConfig } from "@/lib/comms/transport";
import { renderClientWelcome } from "@/lib/comms/email";
import { ONBOARDING_ERROR, ONBOARDING_OK } from "@/lib/onboarding/text";
import { AGENT_PORTAL_LABEL, AGENT_PORTAL_PATH } from "@/lib/agents/portal";
import { updateCompanySettings } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Settings → Client communications & support. Owners only. One corporate source for client e-mails, PDFs and support
 * info. Agent invitations are NOT here: they live in the AGENT PORTAL (sidebar entry above «Configuración»).
 */
export default async function CommunicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang(); const p = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const [company, signer] = await Promise.all([loadCompany(supabase), signerForUser(supabase, userId, lang)]);
  const row = company.row, smtp = smtpConfig(), origin = appOrigin();
  const ok = typeof p.ok === "string" ? ONBOARDING_OK[p.ok] : null, err = typeof p.error === "string" ? (ONBOARDING_ERROR[p.error] ?? ONBOARDING_ERROR.save) : null;
  // Preview only: no recipient. The representative is the signed-in owner.
  const welcome = signer ? renderClientWelcome({ lang, contactName: t("Nombre del cliente", "Client name"), companyName: t("Empresa del cliente", "Client company"),
    service: t("Sitio web", "Website"), representative: signer, nextStep: t("Reunión de kickoff (fecha por confirmar)", "Kickoff meeting (date to be confirmed)"), documents: [],
    invoiceNumber: null, company: company.contact, origin }) : null;
  const clientSenderReady = smtp.configured && smtp.user === company.contact.clientSender.toLowerCase();

  return <Suite active="settings">
    <PageHeader eyebrow={t("Configuración", "Settings")} title={t("Comunicaciones con clientes y soporte", "Client communications & support")}
      description={t("Remitente de correos a clientes, contacto de soporte y plantilla de bienvenida. Solo Miguel y Samuel pueden editarlo.", "Client e-mail sender, support contact and welcome template. Only Miguel and Samuel can edit this.")} />
    {ok && <p className={s.flash} data-tone="ok" role="status">{pick(lang, ...ok)}</p>}
    {err && <p className={s.flash} data-tone="error" role="alert">{pick(lang, ...err)}</p>}
    <p className={s.meta} data-agent-portal-link>{t("Las invitaciones y la gestión de agentes viven en", "Agent invitations and management live in")} <Link href={AGENT_PORTAL_PATH}><strong>{pick(lang, ...AGENT_PORTAL_LABEL)}</strong></Link> {t("(menú lateral, encima de Configuración), no en Configuración.", "(sidebar, above Settings), not in Settings.")}</p>
    <div className={s.split}>
      <div>
        <Panel title={t("Estado de envío a clientes", "Client sending status")} id="status">
          <div className={s.tableWrap}><table className={s.table}><tbody>
            <tr data-sender="client"><td>{t("Correos a clientes", "Client e-mails")}</td><td><span style={{ overflowWrap: "anywhere" }}>{company.contact.clientSender}</span><br />
              <Badge tone={clientSenderReady ? "ok" : "warn"}>{clientSenderReady ? t("SMTP autenticado configurado", "Authenticated SMTP configured") : smtp.configured ? t("BLOQUEADO: la cuenta SMTP no coincide con el remitente", "BLOCKED: SMTP account does not match the sender") : t("BLOQUEADO: SMTP sin configurar", "BLOCKED: SMTP not configured")}</Badge></td></tr>
            <tr><td>{t("Base de datos", "Database")}</td><td><Badge tone={company.ready ? "ok" : "warn"}>{company.ready ? t("Configuración guardada en Avalon OS", "Settings stored in Avalon OS") : t("Migración 20261124140000 pendiente: se usan los valores por defecto", "Migration 20261124140000 pending: defaults in use")}</Badge></td></tr>
          </tbody></table></div>
          <p className={s.meta}>{t("Sin SMTP configurado nada se envía automáticamente: el mensaje se prepara, se envía desde Gmail y se registra la evidencia.", "Without SMTP nothing is sent automatically: prepare the message, send it from Gmail and record the evidence.")}</p>
          <p className={s.meta}>{t("Guía:", "Guide:")} <code>docs/client-experience/EMAIL_AND_INVITATIONS.md</code> · <Link href="/admin/workspace/crm/onboarding">{t("Onboarding y entregas", "Onboarding & delivery")}</Link></p>
        </Panel>
        <Panel title={t("Datos corporativos de soporte", "Corporate support details")} id="company">
          {!company.ready ? <p className={s.meta}>{t("Disponible cuando se aplique la migración 20261124140000.", "Available once migration 20261124140000 is applied.")}</p> :
          <form action={updateCompanySettings} className={s.form} data-company-settings>
            <label className={s.field}>{t("Email de soporte", "Support e-mail")}<input className={s.input} name="support_email" type="email" required defaultValue={row!.support_email} /></label>
            <label className={s.field}>{t("Teléfono empresarial de soporte (vacío si no existe)", "Business support phone (empty if none)")}<input className={s.input} name="support_phone" inputMode="tel" defaultValue={row!.support_phone ?? ""} placeholder={t("Pendiente", "Pending")} /></label>
            <label className={s.check}><input type="checkbox" name="support_phone_approved" defaultChecked={row!.support_phone_approved} /> {t("Confirmo que es un número empresarial aprobado (no personal)", "I confirm it is an approved business number (not personal)")}</label>
            <label className={s.field}>{t("Horario de soporte (solo si está contratado)", "Support hours (only if contracted)")}<input className={s.input} name="support_hours" maxLength={200} defaultValue={row!.support_hours} /></label>
            <label className={s.field}>{t("Remitente de correos a clientes", "Client e-mail sender")}<input className={s.input} name="client_sender_email" type="email" required defaultValue={row!.client_sender_email} /></label>
            <label className={s.field}>{t("Responder a (Reply-To)", "Reply-To")}<input className={s.input} name="reply_to_email" type="email" required defaultValue={row!.reply_to_email} /></label>
            <button className={s.btnPrimary} type="submit">{t("Guardar", "Save")}</button>
          </form>}
        </Panel>
      </div>
      <div>
        <Panel title={t("Vista previa · Bienvenida a clientes", "Preview · Client welcome")} id="preview-welcome">
          {welcome ? <><p className={s.meta}>{t("Asunto", "Subject")}: <strong>{welcome.subject}</strong></p>
            <iframe title={welcome.subject} sandbox="" srcDoc={welcome.html} data-preview="welcome" style={{ width: "100%", height: 620, border: 0, borderRadius: 12, background: "#fff" }} /></>
            : <p className={s.meta}>{t("No se pudo identificar al propietario conectado.", "Could not identify the signed-in owner.")}</p>}
        </Panel>
      </div>
    </div>
  </Suite>;
}
