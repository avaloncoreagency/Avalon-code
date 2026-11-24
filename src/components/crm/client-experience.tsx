import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { PRODUCT_LABEL, PRODUCT_TYPES, STAGE_LABEL, isStage, productTypeForModule, progress, readChecklist, type ProductType } from "@/lib/onboarding/model";
import { readProductState } from "@/lib/os/client-hud";
import { OUTBOX_STATUS } from "@/lib/onboarding/text";
import { startOnboarding } from "@/app/admin/workspace/crm/onboarding/actions";
import { closeConsent, grantConsent, requestConsent } from "@/app/admin/workspace/crm/clients/[id]/experience-actions";
import s from "@/components/sales/sales.module.css";

type Project = { id: string; name: string; module: string; settings?: unknown };
const SCOPES: [string, string, string][] = [["name", "Nombre del cliente", "Client name"], ["logo", "Logo", "Logo"], ["testimonial", "Testimonio (texto aprobado)", "Testimonial (approved text)"],
  ["case_study", "Caso de estudio", "Case study"], ["screenshots", "Capturas del producto", "Product screenshots"], ["results", "Resultados comerciales verificables", "Verifiable business results"], ["reference", "Referencia profesional", "Professional reference"]];
const CHANNELS: [string, string, string][] = [["website", "Sitio web", "Website"], ["social", "Redes sociales", "Social media"], ["proposals", "Propuestas comerciales", "Sales proposals"], ["ads", "Anuncios", "Ads"], ["events", "Eventos", "Events"]];

/**
 * Clients 360 → client experience: onboarding, manuals, communications, testimonial consents and support.
 * Everything reads canonical records by crm_clients.id. Before migration 20261124140000 the panel says so and offers
 * nothing that would fail. Support reuses the products' existing request system (os_projects.settings.client_hud).
 */
export async function ClientExperience({ supabase, clientId, lang, projects, sales }: { supabase: SupabaseClient; clientId: string; lang: Lang; projects: Project[]; sales: { id: string; sale_number: string }[] }) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const [onb, docs, mail, consents] = await Promise.all([
    supabase.from("crm_client_onboardings").select("id,title,product_type,stage,checklist,sale_id,updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(20),
    supabase.from("crm_client_documents").select("id,title,status,onboarding_id,created_at").eq("client_id", clientId).eq("status", "issued").order("created_at", { ascending: false }).limit(20),
    supabase.from("crm_email_outbox").select("id,subject,status,to_email,onboarding_id,sent_at,created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    supabase.from("crm_testimonial_consents").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
  ]);
  const ready = !onb.error;
  const onboardings = (onb.data ?? []) as { id: string; title: string; product_type: ProductType; stage: string; checklist: unknown; sale_id: string | null; updated_at: string }[];
  const withOnboarding = new Set(onboardings.map(o => o.sale_id).filter(Boolean));
  const requests = projects.flatMap(pr => { try { return readProductState((pr.settings as { client_hud?: unknown } | undefined)?.client_hud).requests.map(r => ({ ...r, project: pr })); } catch { return []; } })
    .filter(r => !["closed", "done", "cancelled", "verified"].includes(r.status));
  type Consent = { id: string; signer_name: string; signer_role: string; status: string; scopes: string[]; channels: string[]; approved_text: string; restrictions: string; evidence: string; granted_at: string | null; expires_on: string | null; revoked_at: string | null };
  const consentRows = (consents.data ?? []) as Consent[];
  const label = (list: [string, string, string][], k: string) => { const f = list.find(x => x[0] === k); return f ? pick(lang, f[1], f[2]) : k; };

  return <section className={s.panel} aria-labelledby="client-experience-h" id="client-experience" data-client-experience={ready ? "ready" : "pending"}>
    <header><h2 id="client-experience-h">{t("Onboarding, documentación y soporte", "Onboarding, documentation and support")}</h2>
      <Link className={s.button} href="/admin/workspace/crm/onboarding">{t("Onboarding y entregas", "Onboarding & delivery")}</Link></header>
    {!ready ? <p className={s.flash} data-tone="warn" role="status">{t("Requiere la migración 20261124140000 (pendiente). Las facturas y el soporte existentes siguen disponibles en sus secciones.", "Requires migration 20261124140000 (pending). Existing invoices and support remain available in their sections.")}</p> : <>
      <h3>{t("Onboarding", "Onboarding")}</h3>
      {onboardings.length === 0 ? <p className={s.muted}>{t("Sin onboarding iniciado.", "No onboarding started.")}</p>
        : <ul className={s.list}>{onboardings.map(o => { const pr = progress(readChecklist(o.checklist)); return <li key={o.id} data-client-onboarding={o.stage}>
          <Link href={`/admin/workspace/crm/onboarding/${o.id}`}><strong>{o.title}</strong></Link> · {pick(lang, ...PRODUCT_LABEL[o.product_type])} · {isStage(o.stage) ? pick(lang, ...STAGE_LABEL[o.stage]) : o.stage} · {pr.done}/{pr.total}</li>; })}</ul>}
      <form action={startOnboarding} className={s.inline} style={{ flexWrap: "wrap" }} data-start-onboarding>
        <input type="hidden" name="client_id" value={clientId} />
        <select name="sale_id" aria-label={t("Venta", "Sale")} defaultValue=""><option value="">{t("Sin venta vinculada", "No linked sale")}</option>{sales.filter(x => !withOnboarding.has(x.id)).map(x => <option key={x.id} value={x.id}>{x.sale_number}</option>)}</select>
        <select name="project_id" aria-label={t("Producto", "Product")} defaultValue=""><option value="">{t("Sin producto vinculado", "No linked product")}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="product_type" aria-label={t("Tipo", "Type")} defaultValue={projects[0] ? productTypeForModule(projects[0].module) : "website"}>{PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pick(lang, ...PRODUCT_LABEL[pt])}</option>)}</select>
        <button className={`${s.button} ${s.primary}`} type="submit">{t("Iniciar onboarding", "Start onboarding")}</button>
      </form>

      <h3>{t("Manuales vigentes", "Current manuals")}</h3>
      {(docs.data ?? []).length === 0 ? <p className={s.muted}>{t("Sin manuales generados.", "No manuals generated.")}</p>
        : <ul className={s.list}>{((docs.data ?? []) as { id: string; title: string; onboarding_id: string | null; created_at: string }[]).map(d => <li key={d.id} data-client-document>
          <strong>{d.title}</strong> · {formatDate(lang, d.created_at)}{d.onboarding_id && <a className={s.button} href={`/admin/workspace/crm/onboarding/${d.onboarding_id}/documents/${d.id}`} download>{t("Descargar PDF", "Download PDF")}</a>}</li>)}</ul>}

      <h3>{t("Comunicaciones", "Communications")}</h3>
      {(mail.data ?? []).length === 0 ? <p className={s.muted}>{t("Sin mensajes preparados o enviados.", "No messages prepared or sent.")}</p>
        : <ul className={s.list}>{((mail.data ?? []) as { id: string; subject: string; status: string; to_email: string; onboarding_id: string | null; sent_at: string | null; created_at: string }[]).map(m => <li key={m.id} data-client-email={m.status}>
          {m.onboarding_id ? <Link href={`/admin/workspace/crm/onboarding/${m.onboarding_id}#emails`}>{m.subject}</Link> : m.subject} · {m.to_email} · {pick(lang, ...(OUTBOX_STATUS[m.status] ?? [m.status, m.status]))}{m.sent_at ? ` · ${formatDate(lang, m.sent_at, true)}` : ""}</li>)}</ul>}

      <h3 id="consents">{t("Autorizaciones de testimonios y referencias", "Testimonial and reference consents")}</h3>
      <p className={s.muted}>{t("Separadas del contrato. Nada viene preseleccionado: solo se usa lo que el cliente autorizó por escrito, en los canales indicados y mientras no se revoque. No se publican testimonios inventados ni resultados atípicos como típicos.", "Separate from the agreement. Nothing is preselected: only what the client authorized in writing is used, on the listed channels and until revoked. No invented testimonials or atypical results presented as typical.")}</p>
      <ul className={s.list}>{consentRows.map(c => <li key={c.id} data-consent={c.status} style={{ display: "block" }}>
        <strong>{c.signer_name}</strong>{c.signer_role ? ` · ${c.signer_role}` : ""} · <span className={s.tag} data-tone={c.status === "granted" ? "ok" : c.status === "requested" ? "warn" : "neutral"}>{({ requested: t("Solicitada", "Requested"), granted: t("Concedida", "Granted"), declined: t("Rechazada", "Declined"), revoked: t("Revocada", "Revoked") } as Record<string, string>)[c.status] ?? c.status}</span>
        {c.status === "granted" && <div className={s.muted}>{t("Usos", "Uses")}: {c.scopes.map(k => label(SCOPES, k)).join(", ")} · {t("Canales", "Channels")}: {c.channels.map(k => label(CHANNELS, k)).join(", ")}{c.expires_on ? ` · ${t("vence", "expires")} ${formatDate(lang, c.expires_on)}` : ""}{c.restrictions ? ` · ${t("Restricciones", "Restrictions")}: ${c.restrictions}` : ""}</div>}
        {c.status === "requested" && <details><summary>{t("Registrar la respuesta del cliente", "Record the client's answer")}</summary>
          <form action={grantConsent} className={s.form}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="client_id" value={clientId} />
            <fieldset><legend>{t("Usos autorizados (marca solo lo autorizado por escrito)", "Authorized uses (tick only what was authorized in writing)")}</legend>{SCOPES.map(([k, es, en]) => <label key={k} style={{ display: "inline-flex", gap: 6, marginRight: 12 }}><input type="checkbox" name="scopes" value={k} />{pick(lang, es, en)}</label>)}</fieldset>
            <fieldset><legend>{t("Canales autorizados", "Authorized channels")}</legend>{CHANNELS.map(([k, es, en]) => <label key={k} style={{ display: "inline-flex", gap: 6, marginRight: 12 }}><input type="checkbox" name="channels" value={k} />{pick(lang, es, en)}</label>)}</fieldset>
            <label className={s.field}>{t("Texto aprobado por el cliente (obligatorio para testimonios)", "Client-approved text (required for testimonials)")}<textarea name="approved_text" maxLength={4000} rows={3} /></label>
            <label className={s.field}>{t("Sustento de resultados (obligatorio si autoriza resultados)", "Results substantiation (required if results are authorized)")}<textarea name="results_substantiation" maxLength={2000} rows={2} /></label>
            <label className={s.field}>{t("Relación material a divulgar (descuento, pago, relación)", "Material connection to disclose (discount, payment, relationship)")}<input name="material_connection" maxLength={500} /></label>
            <label className={s.field}>{t("Restricciones", "Restrictions")}<input name="restrictions" maxLength={2000} /></label>
            <label className={s.field}>{t("Evidencia (p. ej. email del cliente con fecha)", "Evidence (e.g. client's dated email)")}<input name="evidence" required minLength={10} maxLength={1000} /></label>
            <label className={s.field}>{t("Vencimiento (opcional)", "Expiry (optional)")}<input type="date" name="expires_on" /></label>
            <div className={s.inline}><button className={`${s.button} ${s.primary}`} type="submit">{t("Registrar autorización", "Record consent")}</button></div>
          </form>
          <form action={closeConsent}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="to" value="declined" /><button className={s.button} type="submit">{t("El cliente no autoriza", "Client declines")}</button></form>
        </details>}
        {c.status === "granted" && <form action={closeConsent} className={s.inline}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="client_id" value={clientId} /><input type="hidden" name="to" value="revoked" />
          <input name="reason" required minLength={3} maxLength={500} placeholder={t("Motivo de la revocación", "Revocation reason")} aria-label={t("Motivo", "Reason")} /><button className={s.button} type="submit">{t("Revocar", "Revoke")}</button></form>}
      </li>)}</ul>
      <form action={requestConsent} className={s.inline} style={{ flexWrap: "wrap" }} data-request-consent>
        <input type="hidden" name="client_id" value={clientId} />
        <input name="signer_name" required minLength={2} maxLength={160} placeholder={t("Persona que autoriza", "Person authorizing")} aria-label={t("Persona que autoriza", "Person authorizing")} />
        <input name="signer_role" maxLength={120} placeholder={t("Cargo", "Role")} aria-label={t("Cargo", "Role")} />
        <input name="signer_email" type="email" maxLength={254} placeholder="email" aria-label="email" />
        <button className={s.button} type="submit">{t("Solicitar autorización", "Request consent")}</button>
      </form>
    </>}

    <h3>{t("Soporte (solicitudes abiertas de sus productos)", "Support (open requests on their products)")}</h3>
    {requests.length === 0 ? <p className={s.muted}>{projects.length ? t("Sin solicitudes abiertas.", "No open requests.") : t("El cliente aún no tiene productos vinculados.", "The client has no linked products yet.")}</p>
      : <ul className={s.list}>{requests.slice(0, 20).map(r => <li key={r.id} data-support-request={r.status}><Link href={`/admin/workspace/products/${r.project.id}`}><strong>{r.title}</strong></Link> · {r.project.name} · {r.severity ?? r.priority} · {r.status}</li>)}</ul>}
    {projects.length > 0 && <p className={s.muted}>{t("Para crear un ticket, abre el producto: usa el sistema de solicitudes existente (tipo, severidad, responsable, notas).", "To create a ticket, open the product: it uses the existing request system (type, severity, assignee, notes).")}</p>}
  </section>;
}
