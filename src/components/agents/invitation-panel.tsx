import type { SupabaseClient } from "@supabase/supabase-js";
import { Badge } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { pick, type Lang } from "@/lib/i18n";
import { appOrigin, loadCompany, signerForUser } from "@/lib/comms/company-server";
import { renderAgentInvite } from "@/lib/comms/email";
import { updateInviteSender } from "./invite-actions";

/**
 * AGENT PORTAL · invitation identity. Mounted inside the Agent Portal (`/admin/staff`) next to «Invitar agente».
 * Shows the exact sender (avalonacoreagency@gmail.com unless an owner changes it), whether it is verified WITH evidence,
 * and a preview of the invitation signed by the SIGNED-IN owner (resolved server-side from the session, never from a
 * browser parameter). The real e-mail is sent once, by Supabase Auth, with its real activation link.
 */
export async function AgentInvitationPanel({ supabase, userId, lang, status }: { supabase: SupabaseClient; userId: string; lang: Lang; status?: string | null }) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const [company, signer] = await Promise.all([loadCompany(supabase), signerForUser(supabase, userId, lang)]);
  const origin = appOrigin(), row = company.row;
  const invite = signer ? renderAgentInvite({ lang, inviter: signer, inviteeName: t("Nombre del agente", "Agent name"), roleLabel: t("Agente comercial", "Sales agent"),
    actionUrl: `${origin}/admin/signup`, expiresHours: 24, company: company.contact, origin }) : null;
  const verified = company.contact.inviteSenderVerified;

  return <section className={s.panel} aria-labelledby="agent-invite-identity" data-agent-invite-identity={verified ? "verified" : "blocked"}>
    <div className={s.panelHead}><h2 id="agent-invite-identity">{t("Identidad de las invitaciones", "Invitation identity")}</h2></div>
    {status === "saved" && <p className={s.flash} data-tone="ok" role="status">{t("Remitente de invitaciones guardado.", "Invitation sender saved.")}</p>}
    {status === "invalid" && <p className={s.flash} data-tone="error" role="alert">{t("Revisa el remitente: «Verificado» exige evidencia técnica.", "Check the sender: «Verified» requires technical evidence.")}</p>}
    <div className={s.tableWrap}><table className={s.table}><tbody>
      <tr data-sender="invite"><td>{t("Remitente", "Sender")}</td><td><span style={{ overflowWrap: "anywhere" }}>{company.contact.inviteSender}</span><br />
        <Badge tone={verified ? "ok" : "warn"}>{verified ? t("Verificado con evidencia", "Verified with evidence") : t("BLOQUEADO: sin verificar", "BLOCKED: unverified")}</Badge></td></tr>
      <tr><td>{t("Firma", "Signature")}</td><td>{signer ? <><strong>{signer.name}</strong>{signer.title ? ` · ${signer.title} | Avalon Core Agency` : ""}</> : <Badge tone="warn">{t("Propietario no identificado", "Owner not identified")}</Badge>}</td></tr>
    </tbody></table></div>
    <p className={s.meta}>{t("Cada invitación la envía Supabase Auth una sola vez, con su enlace real de activación, firmada por el propietario que la crea. El agente queda inactivo hasta que Miguel o Samuel aprueben sus permisos. La marca amarilla de «importante» la decide Gmail: no se puede garantizar.",
      "Each invitation is sent once by Supabase Auth, with its real activation link, signed by the owner who creates it. The agent stays inactive until Miguel or Samuel approve their permissions. Gmail's yellow «important» marker is Gmail's decision: it cannot be guaranteed.")}</p>
    {!company.ready ? <p className={s.meta}>{t("El remitente se podrá editar cuando se aplique la migración 20261124140000.", "The sender becomes editable once migration 20261124140000 is applied.")}</p> :
    <details className={s.details}><summary>{t("Cambiar remitente o registrar verificación", "Change sender or record verification")}</summary>
      <form action={updateInviteSender} className={s.form} data-invite-sender-form>
        <label className={s.field}>{t("Remitente de invitaciones", "Invitation sender")}<input className={s.input} name="invite_sender_email" type="email" required defaultValue={row!.invite_sender_email} /></label>
        <label className={s.field}>{t("Estado", "Status")}<select className={s.select} name="invite_sender_status" defaultValue={row!.invite_sender_status}>
          <option value="unverified">{t("Sin verificar", "Unverified")}</option><option value="verified">{t("Verificado (requiere evidencia)", "Verified (needs evidence)")}</option><option value="failed">{t("Falló la verificación", "Verification failed")}</option></select></label>
        <label className={s.field}>{t("Evidencia técnica (p. ej. cabeceras SPF/DKIM=pass de un envío real)", "Technical evidence (e.g. SPF/DKIM=pass headers from a real send)")}<textarea className={s.textarea} name="invite_sender_evidence" maxLength={1000} rows={2} defaultValue={row!.invite_sender_evidence} /></label>
        <button className={s.btnPrimary} type="submit">{t("Guardar remitente", "Save sender")}</button>
      </form>
    </details>}
    <details className={s.details} open><summary>{t("Vista previa de la invitación", "Invitation preview")}</summary>
      {invite ? <><p className={s.meta}>{t("Asunto", "Subject")}: <strong>{invite.subject}</strong></p>
        <iframe title={invite.subject} sandbox="" srcDoc={invite.html} data-preview="invite" style={{ width: "100%", height: 620, border: 0, borderRadius: 12, background: "#fff" }} /></>
        : <p className={s.meta}>{t("No se pudo identificar al propietario conectado: no se muestra una firma inventada.", "Could not identify the signed-in owner: no invented signature is shown.")}</p>}
    </details>
  </section>;
}
