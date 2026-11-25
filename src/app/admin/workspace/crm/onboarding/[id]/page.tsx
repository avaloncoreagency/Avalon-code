import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, UUID_RE, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { loadOwnerDirectory } from "@/lib/identity/directory";
import { personDisplayName, type DisplayIdentity } from "@/lib/identity/owners";
import { BLOCKER_LABEL, PRODUCT_LABEL, STAGES, STAGE_LABEL, acceptanceBlockers, canMove, deliveryBlockers, requiresLiveUrl, isStage, progress, readChecklist, type ProductType, type Stage } from "@/lib/onboarding/model";
import { readProductState } from "@/lib/os/client-hud";
import { loadCompany } from "@/lib/comms/company-server";
import { verifiedAgreement } from "@/lib/onboarding/evidence-server";
import { smtpConfig } from "@/lib/comms/transport";
import { ONBOARDING_ERROR, ONBOARDING_OK, OUTBOX_STATUS } from "@/lib/onboarding/text";
import { approveAndSend, cancelEmail, generateManual, moveOnboarding, prepareEmail, recordAcceptance, recordDelivery, recordManualSend, setQa, toggleChecklist, updateOnboarding } from "../actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
type Onb = { id: string; client_id: string; sale_id: string | null; project_id: string | null; product_type: ProductType; title: string; stage: string; version: number;
  checklist: unknown; invoice_id: string | null; live_url: string; qa_passed: boolean; commercial_owner_id: string | null; technical_owner_id: string | null;
  next_step: string; next_step_on: string | null; next_step_confirmed: boolean; delivered_at: string | null; delivered_to: string; delivery_note: string; delivery_approved_by: string | null; created_at: string;
  client_accepted_at?: string | null; client_acceptance_evidence?: string; client_acceptance_recorded_by?: string | null };
type Msg = { id: string; kind: string; to_email: string; to_name: string; from_email: string; reply_to: string; subject: string; body_html: string; status: string;
  attachments: { type: string; number?: string; title?: string }[]; approved_by: string | null; approved_at: string | null; sent_at: string | null; provider: string; provider_message_id: string; error: string; attempts: number; created_at: string };

/** CRM → Onboarding y entregas → one client onboarding (owners only; canonical crm_clients.id). */
export default async function OnboardingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const { id } = await params; if (!UUID_RE.test(id)) notFound();
  const lang = await getLang(); const p = await searchParams;
  const r = await supabase.from("crm_client_onboardings").select("*").eq("id", id).maybeSingle();
  if (!r.error && !r.data) notFound();
  const t = (es: string, en: string) => pick(lang, es, en);
  if (r.error) return <Suite active="crm"><div className={s.hud}><OpsHeader lang={lang} active="clients" eyebrow="CRM / Onboarding" title="Onboarding" />
    <p className={s.flash} data-tone="warn">{t("El módulo de onboarding requiere la migración 20261124140000 (pendiente de aplicar).", "Onboarding requires migration 20261124140000 (not applied yet).")}</p></div></Suite>;
  const o = r.data as Onb;
  const [client, contacts, projects, invoices, docs, outbox, owners, company] = await Promise.all([
    supabase.from("crm_clients").select("id,legal_name,trade_name,client_code").eq("id", o.client_id).single(),
    supabase.from("crm_contacts").select("id,full_name,email,is_primary").eq("client_id", o.client_id).order("is_primary", { ascending: false }),
    supabase.from("os_projects").select("id,name,module,settings").eq("client_id", o.client_id).order("updated_at", { ascending: false }).limit(50),
    supabase.from("crm_invoices").select("id,sale_id,number,amount,currency,status,issued_on").eq("client_id", o.client_id).order("issued_on", { ascending: false }).limit(50),
    supabase.from("crm_client_documents").select("id,title,version,status,sha256,created_at,product_type").eq("onboarding_id", o.id).order("created_at", { ascending: false }),
    supabase.from("crm_email_outbox").select("*").eq("onboarding_id", o.id).order("created_at", { ascending: false }).limit(30),
    loadOwnerDirectory(supabase),
    loadCompany(supabase),
  ]);
  const c = client.data as { id: string; legal_name: string; trade_name: string; client_code: string } | null;
  const directory = (owners.data ?? []) as DisplayIdentity[];
  const who = (uid: string | null) => uid ? personDisplayName(directory.find(d => (d.user_id ?? d.id) === uid), t("Usuario", "User")) : "—";
  const list = readChecklist(o.checklist); const pr = progress(list);
  const stage = (isStage(o.stage) ? o.stage : "preparation") as Stage;
  const docRows = (docs.data ?? []) as { id: string; title: string; version: number; status: string; sha256: string; created_at: string }[];
  const verified = await verifiedAgreement(supabase, o.client_id);
  const blockers = deliveryBlockers({ productType: o.product_type, checklist: list, qaPassed: o.qa_passed, liveUrl: o.live_url, manualIssued: docRows.some(d => d.status === "issued"),
    contractVerified: Boolean(verified), deliveredTo: "xx" }).filter(b => b !== "recipient_missing");
  const acceptance = o.client_accepted_at ? null : acceptanceBlockers({ deliveredAt: o.delivered_at, evidence: "x".repeat(10) });
  const msgs = (outbox.data ?? []) as Msg[];
  const smtp = smtpConfig();
  const senderMatches = smtp.configured && smtp.user === company.contact.clientSender.toLowerCase();
  const project = ((projects.data ?? []) as { id: string; name: string; module: string; settings: Record<string, unknown> }[]).find(x => x.id === o.project_id);
  let requests: ReturnType<typeof readProductState>["requests"] = [];
  try { requests = project ? readProductState((project.settings as { client_hud?: unknown })?.client_hud).requests : []; } catch { requests = []; }
  const okMsg = q(p, "ok"), errMsg = q(p, "error");
  const issuedInvoices = ((invoices.data ?? []) as { id: string; number: string; status: string; amount: string; currency: string }[]).filter(x => x.status === "issued");
  const hidden = <><input type="hidden" name="id" value={o.id} /><input type="hidden" name="version" value={o.version} /></>;

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="clients" eyebrow={`CRM / ${t("Onboarding y entregas", "Onboarding & delivery")} / ${c?.client_code ?? ""}`} title={o.title}
      lead={`${c?.trade_name || c?.legal_name || ""} · ${pick(lang, ...PRODUCT_LABEL[o.product_type])} · ${t("Etapa", "Stage")}: ${pick(lang, ...STAGE_LABEL[stage])}`}
      actions={<><Link className={s.button} href={`/admin/workspace/crm/clients/${o.client_id}#client-experience`}>{t("Cliente 360°", "Client 360°")}</Link>
        <Link className={s.button} href="/admin/workspace/crm/onboarding">{t("Todos los onboardings", "All onboardings")}</Link>
        {o.sale_id && <Link className={s.button} href={`/admin/workspace/crm/sales/${o.sale_id}`}>{t("Venta", "Sale")}</Link>}
        <Link className={s.button} href={`/admin/workspace/crm/clients/${o.client_id}/contracts`}>{t("Contratos", "Agreements")}</Link></>} />
    {okMsg && ONBOARDING_OK[okMsg] && <p className={s.flash} data-tone="ok" role="status">{pick(lang, ...ONBOARDING_OK[okMsg])}</p>}
    {errMsg && <p className={s.flash} data-tone="error" role="alert">{pick(lang, ...(ONBOARDING_ERROR[errMsg] ?? ONBOARDING_ERROR.save))}
      {q(p, "blockers") && <> — {q(p, "blockers")!.split(",").map(b => BLOCKER_LABEL[b] ? pick(lang, ...BLOCKER_LABEL[b]) : b).join(" · ")}</>}</p>}

    <section className={s.panel} aria-labelledby="stages" data-onboarding-stage={stage}>
      <header><h2 id="stages">{t("Recorrido", "Journey")}</h2><small className={s.muted}>{t("Checklist", "Checklist")} {pr.done}/{pr.total}</small></header>
      <ol className={s.inline} style={{ flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
        {STAGES.map(st => <li key={st}><span className={s.tag} data-tone={st === stage ? "ok" : STAGES.indexOf(st) < STAGES.indexOf(stage) ? "info" : "neutral"} aria-current={st === stage ? "step" : undefined}>{pick(lang, ...STAGE_LABEL[st])}</span></li>)}
      </ol>
      <div className={s.inline} style={{ marginTop: 12, flexWrap: "wrap" }}>
        {STAGES.filter(to => canMove(stage, to)).map(to => <form key={to} action={moveOnboarding}>{hidden}<input type="hidden" name="to" value={to} />
          <button className={s.button} type="submit">{STAGES.indexOf(to) > STAGES.indexOf(stage) ? "→ " : "← "}{pick(lang, ...STAGE_LABEL[to])}</button></form>)}
      </div>
    </section>

    <section className={s.panel} aria-labelledby="owners">
      <h2 id="owners">{t("Responsables, próximo paso y vínculos", "Owners, next step and links")}</h2>
      <form action={updateOnboarding} className={s.form}>{hidden}
        <div className={s.row}>
          <label className={s.field}>{t("Responsable comercial", "Commercial owner")}<select name="commercial_owner_id" defaultValue={o.commercial_owner_id ?? ""}><option value="">—</option>{directory.map(d => <option key={d.user_id ?? d.id} value={d.user_id ?? d.id}>{personDisplayName(d)}</option>)}</select></label>
          <label className={s.field}>{t("Responsable técnico", "Technical owner")}<select name="technical_owner_id" defaultValue={o.technical_owner_id ?? ""}><option value="">—</option>{directory.map(d => <option key={d.user_id ?? d.id} value={d.user_id ?? d.id}>{personDisplayName(d)}</option>)}</select></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t("Próximo paso", "Next step")}<input name="next_step" maxLength={500} defaultValue={o.next_step} /></label>
          <label className={s.field}>{t("Fecha", "Date")}<input type="date" name="next_step_on" defaultValue={o.next_step_on ?? ""} /></label>
          <label className={s.field}><span><input type="checkbox" name="next_step_confirmed" defaultChecked={o.next_step_confirmed} /> {t("Fecha confirmada con el cliente (si no, es una estimación)", "Date confirmed with the client (otherwise an estimate)")}</span></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>{t("Producto / proyecto", "Product / project")}<select name="project_id" defaultValue={o.project_id ?? ""}><option value="">—</option>{((projects.data ?? []) as { id: string; name: string }[]).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label className={s.field}>{t("Factura emitida para adjuntar", "Issued invoice to attach")}<select name="invoice_id" defaultValue={o.invoice_id ?? ""}><option value="">{invoices.error ? t("Sin acceso financiero", "No finance access") : issuedInvoices.length ? "—" : t("No hay facturas emitidas", "No issued invoices")}</option>{issuedInvoices.map(x => <option key={x.id} value={x.id}>{x.number} · {x.currency} {Number(x.amount).toFixed(2)}</option>)}</select></label>
          <label className={s.field}>{t("URL real del producto (https)", "Real product URL (https)")}<input name="live_url" type="url" inputMode="url" maxLength={500} defaultValue={o.live_url} placeholder="https://" /></label>
        </div>
        <button className={`${s.button} ${s.primary}`} type="submit">{t("Guardar", "Save")}</button>
      </form>
    </section>

    <section className={s.panel} aria-labelledby="checklist" id="checklist">
      <header><h2 id="checklist-h">{t("Checklist del producto", "Product checklist")}</h2><small className={s.muted}>{pr.done}/{pr.total}</small></header>
      <ul className={s.list}>{list.map(i => <li key={i.key} data-checklist={i.key} data-done={i.done ? "1" : "0"}>
        <span>{i.done ? "✓ " : "○ "}{pick(lang, ...i.label)}{i.done && i.done_by ? <small className={s.muted}> · {who(i.done_by)}{i.done_at ? ` · ${formatDate(lang, i.done_at)}` : ""}</small> : null}</span>
        <form action={toggleChecklist}>{hidden}<input type="hidden" name="key" value={i.key} /><input type="hidden" name="done" value={i.done ? "0" : "1"} />
          <button className={s.button} type="submit">{i.done ? t("Desmarcar", "Undo") : t("Marcar hecho", "Mark done")}</button></form></li>)}</ul>
    </section>

    <section className={s.panel} aria-labelledby="documents-h" id="documents">
      <header><h2 id="documents-h">{t("Manuales y documentación", "Manuals and documentation")}</h2></header>
      <p className={s.muted}>{t("El manual se genera con los datos registrados (URL real, alcance del contrato, soporte). No contiene contraseñas. Cada generación crea una versión nueva; las anteriores quedan como «reemplazadas».", "The manual is generated from recorded data (real URL, agreed scope, support). It contains no passwords. Each generation creates a new version; older ones are kept as superseded.")}</p>
      <form action={generateManual} className={s.inline}>{hidden}<select name="lang" defaultValue={lang} aria-label={t("Idioma del manual", "Manual language")}><option value="es">Español</option><option value="en">English</option></select>
        <button className={`${s.button} ${s.primary}`} type="submit">{t("Generar manual PDF", "Generate PDF manual")}</button></form>
      <ul className={s.list}>{docRows.map(d => <li key={d.id} data-document={d.status}><strong>{d.title}</strong> · {d.status === "issued" ? t("Vigente", "Current") : t("Reemplazado", "Superseded")} · {formatDate(lang, d.created_at)}
        <a className={s.button} href={`/admin/workspace/crm/onboarding/${o.id}/documents/${d.id}`} download>{t("Descargar PDF", "Download PDF")}</a><small className={s.muted}>sha256 {d.sha256.slice(0, 12)}…</small></li>)}</ul>
    </section>

    <section className={s.panel} aria-labelledby="emails-h" id="emails">
      <header><h2 id="emails-h">{t("Comunicaciones al cliente", "Client communications")}</h2></header>
      <p className={s.flash} data-tone={senderMatches ? "ok" : "warn"} data-transport={senderMatches ? "ready" : "blocked"}>{senderMatches
        ? t(`Envío configurado desde ${company.contact.clientSender} (SMTP autenticado). Cada envío requiere tu aprobación.`, `Sending configured from ${company.contact.clientSender} (authenticated SMTP). Every send needs your approval.`)
        : t(`El envío automático está BLOQUEADO: falta configurar SMTP del remitente ${company.contact.clientSender} (variables AVALON_SMTP_* en el servidor). Puedes preparar el mensaje, enviarlo desde Gmail y registrar la evidencia.`, `Automatic sending is BLOCKED: SMTP for ${company.contact.clientSender} is not configured (AVALON_SMTP_* server variables). You can prepare the message, send it from Gmail and record the evidence.`)}</p>
      <form action={prepareEmail} className={s.form}>{hidden}
        <div className={s.row}>
          <label className={s.field} style={{ minWidth: 0, maxWidth: "100%" }}>{t("Tipo", "Type")}<select name="kind" defaultValue="client_welcome" style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}><option value="client_welcome">{t("Bienvenida", "Welcome")}</option><option value="invoice_copy">{t("Copia de factura", "Invoice copy")}</option><option value="document_delivery">{t("Entrega de documentación", "Documentation delivery")}</option>
            <option value="onboarding_confirmation">{t("Confirmación de incorporación", "Onboarding confirmation")}</option>
            <option value="information_request">{t("Solicitud de información (requiere nota)", "Information request (note required)")}</option>
            <option value="materials_request">{t("Solicitud de materiales (usa la checklist pendiente)", "Materials request (uses the pending checklist)")}</option>
            <option value="kickoff_confirmation">{t("Confirmación de kickoff (requiere próximo paso o nota)", "Kickoff confirmation (next step or note required)")}</option>
            <option value="progress_update">{t("Avance del proyecto (requiere nota)", "Progress update (note required)")}</option>
            <option value="review_request">{t("Solicitud de revisión (requiere nota)", "Review request (note required)")}</option>
            <option value="approval_request">{t("Solicitud de aprobación (requiere nota)", "Approval request (note required)")}</option>
            <option value="delivery_notice">{t("Aviso de entrega (requiere entrega registrada)", "Delivery notice (recorded delivery required)")}</option>
            <option value="receipt_confirmation">{t("Confirmación de recepción (requiere nota)", "Receipt confirmation (note required)")}</option>
            <option value="support_info">{t("Información de soporte", "Support information")}</option>
            <option value="maintenance_notice">{t("Aviso de mantenimiento (requiere nota)", "Maintenance notice (note required)")}</option>
            <option value="renewal_review">{t("Renovación para revisar (requiere nota)", "Renewal for review (note required)")}</option></select></label>
          <label className={s.field}>{t("Nota del propietario (avance, renovación u observación; máx. 1000)", "Owner note (progress, renewal or remark; max 1000)")}<textarea name="note" maxLength={1000} rows={3} /></label>
          <label className={s.field}>{t("Destinatario (contacto registrado)", "Recipient (recorded contact)")}<select name="contact_id" required>{((contacts.data ?? []) as { id: string; full_name: string; email: string | null }[]).filter(x => x.email).map(x => <option key={x.id} value={x.id}>{x.full_name} · {x.email}</option>)}</select></label>
          <label className={s.field}>{t("Idioma", "Language")}<select name="lang" defaultValue={lang}><option value="es">Español</option><option value="en">English</option></select></label>
        </div>
        <div className={s.inline}>
          <label><input type="checkbox" name="attach_invoice" defaultChecked={Boolean(o.invoice_id)} disabled={!o.invoice_id} /> {t("Adjuntar la factura seleccionada", "Attach the selected invoice")}</label>
          <label><input type="checkbox" name="attach_documents" defaultChecked={docRows.some(d => d.status === "issued")} disabled={!docRows.some(d => d.status === "issued")} /> {t("Adjuntar el manual vigente", "Attach the current manual")}</label>
        </div>
        <p className={s.muted}>{t(`Remitente: ${company.contact.clientSender} · Responder a: ${company.contact.replyTo}. Preparar no envía nada.`, `From: ${company.contact.clientSender} · Reply-To: ${company.contact.replyTo}. Preparing sends nothing.`)}</p>
        <button className={s.button} type="submit">{t("Preparar mensaje", "Prepare message")}</button>
      </form>
      <ul className={s.list}>{msgs.map(m => <li key={m.id} data-outbox={m.status} style={{ display: "block" }}>
        <strong>{m.subject}</strong> · {m.to_name} &lt;{m.to_email}&gt; · <span className={s.tag} data-tone={m.status === "sent" ? "ok" : m.status === "failed" ? "danger" : "warn"}>{pick(lang, ...(OUTBOX_STATUS[m.status] ?? [m.status, m.status]))}</span>
        {m.attachments?.length > 0 && <small className={s.muted}> · {t("Adjuntos", "Attachments")}: {m.attachments.map(a => a.number ?? a.title).join(", ")}</small>}
        {m.status === "sent" && <small className={s.muted} data-sent-meaning> · {t("aceptado por el servidor SMTP; no confirma que llegó a la bandeja", "accepted by the SMTP server; not proof it reached the inbox")} · {formatDate(lang, m.sent_at!, true)} · {m.provider === "manual" ? t("envío manual registrado", "manual send recorded") : m.provider} · {t("aprobado por", "approved by")} {who(m.approved_by)}</small>}
        {m.error && <small className={s.muted}> · {m.error}</small>}
        <details><summary>{t("Vista previa", "Preview")}</summary><iframe title={m.subject} sandbox="" srcDoc={m.body_html} style={{ width: "100%", height: 520, border: "1px solid #33427a", borderRadius: 10, background: "#fff" }} /></details>
        {["prepared", "approved", "failed", "blocked_no_transport"].includes(m.status) && <div className={s.inline} style={{ flexWrap: "wrap", marginTop: 8 }}>
          <form action={approveAndSend}><input type="hidden" name="message_id" value={m.id} /><button className={`${s.button} ${s.primary}`} type="submit" disabled={!senderMatches}>{t("Aprobar y enviar", "Approve and send")}</button></form>
          <form action={recordManualSend} className={s.inline}><input type="hidden" name="message_id" value={m.id} /><input name="evidence" minLength={10} maxLength={300} required placeholder={t("Evidencia del envío manual (p. ej. ID del mensaje en Gmail)", "Manual send evidence (e.g. Gmail message id)")} aria-label={t("Evidencia", "Evidence")} />
            <button className={s.button} type="submit">{t("Registrar envío manual", "Record manual send")}</button></form>
          <form action={cancelEmail}><input type="hidden" name="message_id" value={m.id} /><button className={s.button} type="submit">{t("Cancelar", "Cancel")}</button></form>
        </div>}</li>)}</ul>
    </section>

    <section className={s.panel} aria-labelledby="delivery-h" id="delivery" data-delivery-blockers={blockers.join(",")}>
      <header><h2 id="delivery-h">{t("Entrega", "Delivery")}</h2></header>
      {o.delivered_at ? <p className={s.flash} data-tone="ok">{t("Entregado el", "Delivered on")} {formatDate(lang, o.delivered_at, true)} · {t("a", "to")} {o.delivered_to} · {t("aprobado por", "approved by")} {who(o.delivery_approved_by)}{o.delivery_note ? ` · ${o.delivery_note}` : ""}</p> : <>
        <form action={setQa} className={s.inline}>{hidden}<input type="hidden" name="qa" value={o.qa_passed ? "0" : "1"} /><span>{o.qa_passed ? t("QA aprobado", "QA passed") : t("QA pendiente", "QA pending")}</span>
          <button className={s.button} type="submit">{o.qa_passed ? t("Reabrir QA", "Reopen QA") : t("Marcar QA aprobado", "Mark QA passed")}</button></form>
        {blockers.length > 0 ? <ul className={s.list}>{blockers.map(b => <li key={b} className={s.notice}>{pick(lang, ...BLOCKER_LABEL[b])}</li>)}</ul>
          : <p className={s.muted}>{t("Todo listo para entregar.", "Ready to deliver.")}</p>}
        <form action={recordDelivery} className={s.form}>{hidden}
          <div className={s.row}><label className={s.field}>{t("Receptor de la entrega (cliente)", "Delivery recipient (client)")}<input name="delivered_to" maxLength={200} required /></label>
            <label className={s.field}>{t("Nota / garantía pactada", "Note / agreed warranty")}<input name="delivery_note" maxLength={1000} /></label></div>
          <button className={`${s.button} ${s.primary}`} type="submit" disabled={stage !== "delivery_ready" || blockers.length > 0}>{t("Registrar entrega", "Record delivery")}</button>
          {stage !== "delivery_ready" && <small className={s.muted}> {t("Disponible en la etapa «Entrega preparada».", "Available at the «Delivery ready» stage.")}</small>}
          {!requiresLiveUrl(o.product_type) && <small className={s.muted}> {t("Este servicio no exige URL pública: la evidencia es el checklist, QA, manual, contrato verificado y receptor.", "This service needs no public URL: evidence is the checklist, QA, manual, verified agreement and recipient.")}</small>}
        </form></>}
      {o.delivered_at && <div data-client-acceptance={o.client_accepted_at ? "recorded" : "pending"}>
        <h3>{t("Aceptación del cliente", "Client acceptance")}</h3>
        <p className={s.muted}>{t("La aceptación del cliente es distinta de la entrega registrada y de la publicación técnica. Registra la evidencia real (p. ej. correo del cliente con fecha).", "Client acceptance is distinct from the recorded handover and from technical publication. Record real evidence (e.g. the client's dated e-mail).")}</p>
        {o.client_accepted_at ? <p className={s.flash} data-tone="ok">{t("Aceptado el", "Accepted on")} {formatDate(lang, o.client_accepted_at, true)} · {o.client_acceptance_evidence} · {t("registrado por", "recorded by")} {who(o.client_acceptance_recorded_by ?? null)}</p>
          : <form action={recordAcceptance} className={s.form}>{hidden}
            <label className={s.field}>{t("Evidencia de aceptación del cliente", "Client acceptance evidence")}<textarea name="acceptance_evidence" minLength={10} maxLength={1000} rows={2} required /></label>
            <button className={s.button} type="submit" disabled={Boolean(acceptance?.includes("not_delivered"))}>{t("Registrar aceptación", "Record acceptance")}</button>
          </form>}
      </div>}
    </section>

    <section className={s.panel} aria-labelledby="support-h">
      <header><h2 id="support-h">{t("Soporte del producto", "Product support")}</h2>{project && <Link className={s.button} href={`/admin/workspace/products/${project.id}`}>{t("Abrir producto y crear solicitud", "Open product and create request")}</Link>}</header>
      {!project ? <p className={s.muted}>{t("Vincula el producto/proyecto para ver y crear solicitudes de soporte (sistema de solicitudes existente del producto).", "Link the product/project to see and create support requests (the product's existing request system).")}</p>
        : requests.length === 0 ? <p className={s.muted}>{t("Sin solicitudes registradas.", "No requests recorded.")}</p>
        : <ul className={s.list}>{requests.slice(0, 20).map(rq => <li key={rq.id}><strong>{rq.title}</strong> · {rq.severity ?? rq.priority} · {rq.status}{rq.assignee_id ? ` · ${who(rq.assignee_id)}` : ""}</li>)}</ul>}
    </section>
  </div></Suite>;
}
