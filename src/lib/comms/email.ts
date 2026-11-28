/**
 * AVALON-CLAUDE-CAX-OMEGA-001 — corporate e-mail templates (pure; no I/O, no secrets).
 * Table-based, inline-styled HTML that renders in Gmail/iOS Mail, plus a plain-text alternative. Every value is escaped.
 * The signer always comes from the authenticated identity (official owner names), never from a browser parameter.
 */
import { isProductType, requiresLiveUrl, type ProductType } from "@/lib/onboarding/model";
import { officialOwnerName, personDisplayName, type DisplayIdentity } from "@/lib/identity/owners";

export type Lang = "es" | "en";
export type Rendered = { subject: string; html: string; text: string };
export type Signer = { name: string; title: string };
/** Corporate contact data (avalon_company_settings). A phone appears only when an owner approved a business number. */
export type CompanyContact = {
  supportEmail: string; supportPhone: string | null; supportHours: string;
  replyTo: string; clientSender: string; inviteSender: string; inviteSenderVerified: boolean;
};
/** AVL-COMMS-FINAL-001: one corporate mailbox sends every Avalon message (agent invitations through Supabase Auth SMTP,
 * client e-mails through AVALON_SMTP_*), receives replies and is the published support contact. Owner sign-in identities
 * (lib/auth/owners) are separate and never change with this setting. */
export const CORPORATE_MAILBOX = "avalonacoreagency@gmail.com";
export const DEFAULT_COMPANY: CompanyContact = {
  supportEmail: CORPORATE_MAILBOX, supportPhone: null, supportHours: "",
  replyTo: CORPORATE_MAILBOX, clientSender: CORPORATE_MAILBOX,
  inviteSender: CORPORATE_MAILBOX, inviteSenderVerified: false,
};
export const BRAND = { name: "Avalon Core Agency", navy: "#09112a", ink: "#1e273e", muted: "#6b7387", accent: "#3554ff", violet: "#7a5cff", line: "#e1e5ef", tint: "#f4f6fb" };
const DEFAULT_ORIGIN = "https://avaloncoreagency.com";

const T = (lang: Lang, es: string, en: string) => (lang === "es" ? es : en);
export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const oneLine = (v: string, max = 160) => v.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
/** Only https links (or the app origin) are ever rendered as buttons. */
export function safeUrl(url: string): string | null {
  try { const u = new URL(url); return u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) ? u.toString() : null; } catch { return null; }
}

/** Signer from the authenticated owner's directory entry. Official names win; a profile title is used when present. */
export function signerFrom(person: (DisplayIdentity & { title?: string | null }) | null | undefined, lang: Lang): Signer | null {
  const name = personDisplayName(person, "");
  if (!name) return null;
  const title = (person?.title ?? "").trim();
  const isOwner = Boolean(officialOwnerName(person?.email));
  return { name, title: title || (isOwner ? T(lang, "Cofundador", "Co-founder") : "") };
}

function layout(lang: Lang, o: { preheader: string; heading: string; bodyHtml: string; cta?: { label: string; url: string } | null; after?: string; signer?: Signer | null;
  company: CompanyContact; origin?: string; footerNote?: string }): string {
  const origin = (o.origin && safeUrl(o.origin)) ? o.origin.replace(/\/$/, "") : DEFAULT_ORIGIN;
  const logo = `${origin}/brand/email/avalon-mark.png`;
  const cta = o.cta && safeUrl(o.cta.url) ? `
      <tr><td style="padding:8px 32px 4px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="border-radius:10px;background:${BRAND.accent}">
        <a href="${esc(o.cta.url)}" style="display:inline-block;padding:14px 26px;font:700 15px/1 Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:10px">${esc(o.cta.label)}</a>
      </td></tr></table></td></tr>
      <tr><td style="padding:10px 32px 0;font:12px/1.5 Helvetica,Arial,sans-serif;color:${BRAND.muted}">${T(lang, "Si el botón no funciona, copia este enlace en tu navegador:", "If the button does not work, paste this link in your browser:")}<br><a href="${esc(o.cta.url)}" style="color:${BRAND.accent};word-break:break-all">${esc(o.cta.url)}</a></td></tr>` : "";
  const after = o.after ? `
      <tr><td style="padding:14px 32px 0;font:15px/1.65 Helvetica,Arial,sans-serif;color:${BRAND.ink}">${o.after}</td></tr>` : "";
  const sign = o.signer ? `
      <tr><td style="padding:22px 32px 0;font:15px/1.6 Helvetica,Arial,sans-serif;color:${BRAND.ink}">${T(lang, "Atentamente,", "Best regards,")}<br>
        <strong>${esc(o.signer.name)}</strong>${o.signer.title ? `<br><span style="color:${BRAND.muted}">${esc(o.signer.title)} | ${BRAND.name}</span>` : `<br><span style="color:${BRAND.muted}">${BRAND.name}</span>`}</td></tr>` : "";
  const phone = o.company.supportPhone ? ` · ${esc(o.company.supportPhone)}` : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.tint}">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.tint}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.line}">
    <tr><td style="background:${BRAND.navy};padding:22px 32px;border-bottom:3px solid ${BRAND.accent}">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="vertical-align:middle"><img src="${esc(logo)}" width="44" height="41" alt="Avalon Core Agency" style="display:block;border:0"></td>
        <td style="vertical-align:middle;padding-left:12px;font:800 19px/1.1 Helvetica,Arial,sans-serif;letter-spacing:2px;color:#ffffff">AVALON<br><span style="font:700 10px/1.4 Helvetica,Arial,sans-serif;letter-spacing:3px;color:#bcc8f2">CORE AGENCY</span></td>
      </tr></table></td></tr>
    <tr><td style="padding:28px 32px 6px;font:700 22px/1.3 Helvetica,Arial,sans-serif;color:${BRAND.navy}">${esc(o.heading)}</td></tr>
    <tr><td style="padding:6px 32px 8px;font:15px/1.65 Helvetica,Arial,sans-serif;color:${BRAND.ink}">${o.bodyHtml}</td></tr>${cta}${after}${sign}
    <tr><td style="padding:26px 32px 26px"><hr style="border:0;border-top:1px solid ${BRAND.line};margin:0 0 14px">
      <p style="margin:0;font:12px/1.6 Helvetica,Arial,sans-serif;color:${BRAND.muted}">${BRAND.name} · ${T(lang, "Soporte", "Support")}: <a href="mailto:${esc(o.company.supportEmail)}" style="color:${BRAND.accent}">${esc(o.company.supportEmail)}</a>${phone}${o.company.supportHours ? ` · ${esc(o.company.supportHours)}` : ""}</p>
      ${o.footerNote ? `<p style="margin:8px 0 0;font:12px/1.6 Helvetica,Arial,sans-serif;color:${BRAND.muted}">${esc(o.footerNote)}</p>` : ""}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function textLayout(lang: Lang, lines: string[], signer: Signer | null | undefined, company: CompanyContact) {
  const sign = signer ? [T(lang, "Atentamente,", "Best regards,"), signer.name, signer.title ? `${signer.title} | ${BRAND.name}` : BRAND.name] : [];
  const contact = `${T(lang, "Soporte", "Support")}: ${company.supportEmail}${company.supportPhone ? ` · ${company.supportPhone}` : ""}`;
  return [...lines, "", ...sign, "", "— " + BRAND.name, contact].join("\n");
}
const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`;

// ── Agent invitation ─────────────────────────────────────────────────────────────────────────────────────────────
export type AgentInviteInput = { lang: Lang; inviter: Signer; inviteeName: string; roleLabel: string; actionUrl: string; expiresHours: number; company: CompanyContact; origin?: string };
export function renderAgentInvite(i: AgentInviteInput): Rendered {
  const L = i.lang, name = oneLine(i.inviteeName, 80) || T(L, "equipo", "there");
  const subject = T(L, `Avalon Core Agency — ${i.inviter.name} te invita a unirte al equipo`, `Avalon Core Agency — ${i.inviter.name} invited you to join the team`);
  const body = [
    p(`${T(L, "Hola", "Hello")}, ${esc(name)}:`),
    p(`<strong>${T(L, "¡Bienvenido a Avalon Core Agency!", "Welcome to Avalon Core Agency!")}</strong>`),
    p(T(L, `${esc(i.inviter.name)} te ha enviado una invitación para formar parte de nuestro equipo${i.roleLabel ? ` como <strong>${esc(oneLine(i.roleLabel, 80))}</strong>` : ""}.`,
      `${esc(i.inviter.name)} has invited you to join our team${i.roleLabel ? ` as <strong>${esc(oneLine(i.roleLabel, 80))}</strong>` : ""}.`)),
    p(T(L, "Hemos preparado un espacio de trabajo privado desde el que podrás consultar tus actividades, clientes asignados, leads, tareas, calendario y comunicaciones autorizadas.",
      "We have prepared a private workspace where you can see your activities, assigned clients, leads, tasks, calendar and authorized communications.")),
  ].join("");
  const after = [
    p(T(L, `Este enlace es personal, seguro y vence en ${i.expiresHours} horas.`, `This link is personal, secure and expires in ${i.expiresHours} hours.`)),
    p(T(L, "Una vez configures tu acceso, la dirección de Avalon Core Agency habilitará los permisos correspondientes a tu puesto.",
      "Once you set up your access, Avalon Core Agency's leadership will enable the permissions for your role.")),
    p(`<span style="color:${BRAND.muted}">${T(L, "Si no esperabas esta invitación, puedes ignorar este mensaje o escribirnos a", "If you were not expecting this invitation, you can ignore this message or write to")} <a href="mailto:${esc(i.company.supportEmail)}" style="color:${BRAND.accent}">${esc(i.company.supportEmail)}</a>.</span>`),
  ].join("");
  const html = layout(L, { preheader: subject, heading: T(L, "Invitación al equipo", "Team invitation"), bodyHtml: body,
    cta: { label: T(L, "ACTIVAR MI CUENTA", "ACTIVATE MY ACCOUNT"), url: i.actionUrl }, after, signer: i.inviter, company: i.company, origin: i.origin,
    footerNote: T(L, `Consejo: agrega ${i.company.inviteSender} a tus contactos para recibir siempre nuestros avisos.`, `Tip: add ${i.company.inviteSender} to your contacts so our notices always reach you.`) });
  const text = textLayout(L, [
    `${T(L, "Hola", "Hello")}, ${name}:`, "", T(L, "¡Bienvenido a Avalon Core Agency!", "Welcome to Avalon Core Agency!"),
    T(L, `${i.inviter.name} te ha enviado una invitación para formar parte de nuestro equipo.`, `${i.inviter.name} has invited you to join our team.`),
    "", `${T(L, "Activar mi cuenta", "Activate my account")}: ${i.actionUrl}`,
    T(L, `El enlace es personal y vence en ${i.expiresHours} horas. Tus permisos se habilitan tras la aprobación de la dirección.`, `The link is personal and expires in ${i.expiresHours} hours. Permissions are enabled after leadership approval.`),
    T(L, "Si no esperabas esta invitación, ignora este mensaje.", "If you were not expecting this invitation, ignore this message."),
  ], i.inviter, i.company);
  return { subject, html, text };
}

// ── Client welcome ───────────────────────────────────────────────────────────────────────────────────────────────
export type WelcomeInput = { lang: Lang; contactName: string; companyName: string; service: string; representative: Signer;
  nextStep: string | null; documents: string[]; invoiceNumber: string | null; company: CompanyContact; origin?: string };
export function renderClientWelcome(i: WelcomeInput): Rendered {
  const L = i.lang;
  const subject = T(L, "Bienvenido a Avalon Core Agency — Comencemos tu proyecto", "Welcome to Avalon Core Agency — Let's start your project");
  const rows: [string, string][] = [[T(L, "Servicio", "Service"), i.service], [T(L, "Representante de Avalon", "Avalon representative"), i.representative.name]];
  if (i.nextStep) rows.push([T(L, "Próximo paso", "Next step"), i.nextStep]);
  const table = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 16px;border:1px solid ${BRAND.line};border-radius:10px">${rows.map(([k, v], n) =>
    `<tr><td style="padding:10px 14px;background:${n % 2 ? "#ffffff" : BRAND.tint};font:12px/1.4 Helvetica,Arial,sans-serif;color:${BRAND.muted};width:42%">${esc(k)}</td><td style="padding:10px 14px;background:${n % 2 ? "#ffffff" : BRAND.tint};font:700 14px/1.4 Helvetica,Arial,sans-serif;color:${BRAND.navy}">${esc(oneLine(v, 300))}</td></tr>`).join("")}</table>`;
  const docs = i.documents.length || i.invoiceNumber
    ? p(`<strong>${T(L, "Documentación", "Documentation")}</strong><br>${[...i.documents.map(d => esc(oneLine(d, 160))), ...(i.invoiceNumber ? [T(L, `Copia de la factura ${esc(i.invoiceNumber)}`, `Copy of invoice ${esc(i.invoiceNumber)}`)] : [])].map(d => `• ${d}`).join("<br>")}`)
    : "";
  const support = p(`<strong>${T(L, "Soporte técnico", "Technical support")}</strong><br>Email: <a href="mailto:${esc(i.company.supportEmail)}" style="color:${BRAND.accent}">${esc(i.company.supportEmail)}</a>${i.company.supportPhone ? `<br>${T(L, "Teléfono", "Phone")}: ${esc(i.company.supportPhone)}` : ""}${i.company.supportHours ? `<br>${esc(i.company.supportHours)}` : ""}`);
  const body = [
    p(`${T(L, "Hola", "Hello")}, ${esc(oneLine(i.contactName, 80))}:`),
    p(`<strong>${T(L, "¡Bienvenido a Avalon Core Agency!", "Welcome to Avalon Core Agency!")}</strong> ${T(L, `Nos alegra comenzar a trabajar contigo y con ${esc(oneLine(i.companyName))}.`, `We are glad to start working with you and ${esc(oneLine(i.companyName))}.`)}`),
    p(T(L, `Tu proyecto de <strong>${esc(oneLine(i.service, 120))}</strong> ha iniciado nuestro proceso de onboarding. Nuestro objetivo es organizar claramente los materiales, responsabilidades y siguientes pasos para que aproveches el servicio contratado.`,
      `Your <strong>${esc(oneLine(i.service, 120))}</strong> project has started our onboarding process. Our goal is to clearly organize materials, responsibilities and next steps so you get the most from the contracted service.`)),
    `<p style="margin:0 0 6px"><strong>${T(L, "Información de tu proyecto", "Your project")}</strong></p>`, table, docs, support,
    p(T(L, "Gracias por confiar en Avalon Core Agency.", "Thank you for trusting Avalon Core Agency.")),
  ].join("");
  const html = layout(L, { preheader: T(L, "Tu proyecto comenzó: servicio, responsable y próximos pasos.", "Your project has started: service, owner and next steps."),
    heading: T(L, "Comencemos tu proyecto", "Let's start your project"), bodyHtml: body, signer: i.representative, company: i.company, origin: i.origin });
  const text = textLayout(L, [
    `${T(L, "Hola", "Hello")}, ${oneLine(i.contactName, 80)}:`, "",
    T(L, `¡Bienvenido a Avalon Core Agency! Tu proyecto de ${oneLine(i.service, 120)} para ${oneLine(i.companyName)} inició el onboarding.`, `Welcome to Avalon Core Agency! Your ${oneLine(i.service, 120)} project for ${oneLine(i.companyName)} has started onboarding.`),
    "", ...rows.map(([k, v]) => `${k}: ${oneLine(v, 300)}`),
    ...(i.documents.length || i.invoiceNumber ? ["", T(L, "Documentación:", "Documentation:"), ...i.documents.map(d => `- ${oneLine(d, 160)}`), ...(i.invoiceNumber ? [`- ${T(L, "Factura", "Invoice")} ${i.invoiceNumber}`] : [])] : []),
    "", T(L, "Gracias por confiar en Avalon Core Agency.", "Thank you for trusting Avalon Core Agency."),
  ], i.representative, i.company);
  return { subject, html, text };
}

// ── Invoice copy / document delivery ─────────────────────────────────────────────────────────────────────────────
export function renderInvoiceCopy(i: { lang: Lang; contactName: string; invoiceNumber: string; companyName: string; representative: Signer; company: CompanyContact; origin?: string }): Rendered {
  const L = i.lang;
  const subject = T(L, `Avalon Core Agency — Copia de la factura ${oneLine(i.invoiceNumber, 60)}`, `Avalon Core Agency — Copy of invoice ${oneLine(i.invoiceNumber, 60)}`);
  const lines = [T(L, `Adjuntamos una copia de la factura ${i.invoiceNumber} de ${i.companyName}.`, `Attached is a copy of invoice ${i.invoiceNumber} for ${i.companyName}.`),
    T(L, "Este envío es solo una copia del documento emitido: no crea cargos nuevos ni cambia el estado de pago.", "This is only a copy of the issued document: it creates no new charge and does not change the payment status.")];
  const html = layout(L, { preheader: subject, heading: T(L, "Copia de tu factura", "Your invoice copy"),
    bodyHtml: p(`${T(L, "Hola", "Hello")}, ${esc(oneLine(i.contactName, 80))}:`) + lines.map(l => p(esc(l))).join(""), signer: i.representative, company: i.company, origin: i.origin });
  return { subject, html, text: textLayout(L, [`${T(L, "Hola", "Hello")}, ${oneLine(i.contactName, 80)}:`, "", ...lines], i.representative, i.company) };
}
export function renderDocumentDelivery(i: { lang: Lang; contactName: string; documents: string[]; product: string; representative: Signer; company: CompanyContact; origin?: string }): Rendered {
  const L = i.lang;
  const subject = T(L, `Avalon Core Agency — Documentación de ${oneLine(i.product, 80)}`, `Avalon Core Agency — ${oneLine(i.product, 80)} documentation`);
  const list = i.documents.map(d => `• ${esc(oneLine(d, 160))}`).join("<br>");
  const html = layout(L, { preheader: subject, heading: T(L, "Documentación de tu producto", "Your product documentation"),
    bodyHtml: p(`${T(L, "Hola", "Hello")}, ${esc(oneLine(i.contactName, 80))}:`) + p(T(L, `Adjuntamos la documentación de <strong>${esc(oneLine(i.product, 120))}</strong>:`, `Attached is the documentation for <strong>${esc(oneLine(i.product, 120))}</strong>:`)) + p(list)
      + p(T(L, "Guárdala en un lugar seguro. No contiene contraseñas: tus credenciales se gestionan por separado.", "Keep it safe. It contains no passwords: your credentials are handled separately.")),
    signer: i.representative, company: i.company, origin: i.origin });
  return { subject, html, text: textLayout(L, [`${T(L, "Hola", "Hello")}, ${oneLine(i.contactName, 80)}:`, "", T(L, `Documentación de ${i.product}:`, `${i.product} documentation:`), ...i.documents.map(d => `- ${d}`)], i.representative, i.company) };
}

/**
 * Supabase Auth "Invite user" template (Go template syntax). Supabase Auth itself sends it with the real
 * {{ .ConfirmationURL }} — one provider per invitation, no custom link. The invoking function MUST pass, from the
 * server-side authenticated owner (never the browser): data.inviter_name, data.inviter_title, data.invitee_name,
 * data.role_label, data.lang ('es'|'en'). See docs/client-experience/EMAIL_AND_INVITATIONS.md.
 */
export function supabaseInviteTemplate(company: CompanyContact = DEFAULT_COMPANY, origin = DEFAULT_ORIGIN): string {
  const es = renderAgentInvite({ lang: "es", inviter: { name: "{{ .Data.inviter_name }}", title: "{{ .Data.inviter_title }}" }, inviteeName: "{{ .Data.invitee_name }}",
    roleLabel: "{{ .Data.role_label }}", actionUrl: "https://CONFIRMATION_URL.invalid", expiresHours: 24, company, origin });
  const en = renderAgentInvite({ lang: "en", inviter: { name: "{{ .Data.inviter_name }}", title: "{{ .Data.inviter_title }}" }, inviteeName: "{{ .Data.invitee_name }}",
    roleLabel: "{{ .Data.role_label }}", actionUrl: "https://CONFIRMATION_URL.invalid", expiresHours: 24, company, origin });
  // Template placeholders survive escaping (no special chars); the URL placeholder becomes Supabase's variable.
  const fix = (s: string) => s.replaceAll("https://CONFIRMATION_URL.invalid", "{{ .ConfirmationURL }}");
  return `{{ if eq .Data.lang "en" }}${fix(en.html)}{{ else }}${fix(es.html)}{{ end }}`;
}

// ── Client lifecycle messages (onboarding → delivery → support → renewal) ─────────────────────────────────────────
// Every line comes from recorded CRM data or from the owner's own note; nothing is promised that was not recorded.
export const LIFECYCLE_KINDS = ["onboarding_confirmation", "information_request", "materials_request", "kickoff_confirmation", "progress_update",
  "review_request", "approval_request", "delivery_notice", "receipt_confirmation", "support_info", "maintenance_notice", "renewal_review"] as const;
export type LifecycleKind = typeof LIFECYCLE_KINDS[number];
export const isLifecycleKind = (v: string): v is LifecycleKind => (LIFECYCLE_KINDS as readonly string[]).includes(v);
export type LifecycleInput = {
  kind: LifecycleKind; lang: Lang; contactName: string; companyName: string; product: string; representative: Signer; company: CompanyContact; origin?: string;
  stageLabel: string; progress: { done: number; total: number } | null; nextStep: string | null; note: string;
  productType: ProductType; liveUrl: string | null; deliveredOn: string | null;
  /** Pending items of the service checklist (website / e-commerce / CRM / marketing), already in the message language. */
  pending?: string[];
};
/** Returns null when the recorded facts do not support the message (e.g. a delivery notice without a recorded delivery). */
export function renderLifecycle(i: LifecycleInput): Rendered | null {
  const L = i.lang, name = oneLine(i.contactName, 80), product = oneLine(i.product, 120), note = i.note.trim().slice(0, 1000);
  const supportLines = [T(L, `Correo de soporte: ${i.company.supportEmail}`, `Support e-mail: ${i.company.supportEmail}`),
    ...(i.company.supportPhone ? [T(L, `Teléfono: ${i.company.supportPhone}`, `Phone: ${i.company.supportPhone}`)] : []),
    ...(i.company.supportHours ? [T(L, `Horario: ${i.company.supportHours}`, `Hours: ${i.company.supportHours}`)] : [])];
  let subject: string, heading: string, lines: string[];
  switch (i.kind) {
    case "onboarding_confirmation":
      subject = T(L, `Avalon Core Agency — Confirmamos el inicio de ${product}`, `Avalon Core Agency — ${product} is officially underway`);
      heading = T(L, "Incorporación confirmada", "Onboarding confirmed");
      lines = [T(L, `Confirmamos que ${i.companyName} quedó incorporado y que el proyecto ${product} está en marcha.`, `We confirm ${i.companyName} is onboarded and the ${product} project is underway.`),
        T(L, `Etapa actual: ${i.stageLabel}.`, `Current stage: ${i.stageLabel}.`),
        ...(i.nextStep ? [T(L, `Próximo paso: ${i.nextStep}.`, `Next step: ${i.nextStep}.`)] : [])];
      break;
    case "progress_update":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Avance de ${product}`, `Avalon Core Agency — ${product} progress update`);
      heading = T(L, "Avance de tu proyecto", "Your project progress");
      lines = [T(L, `Etapa actual: ${i.stageLabel}.`, `Current stage: ${i.stageLabel}.`),
        ...(i.progress && i.progress.total ? [T(L, `Checklist: ${i.progress.done} de ${i.progress.total} puntos completados.`, `Checklist: ${i.progress.done} of ${i.progress.total} items completed.`)] : []),
        note, ...(i.nextStep ? [T(L, `Próximo paso: ${i.nextStep}.`, `Next step: ${i.nextStep}.`)] : [])];
      break;
    case "delivery_notice":
      if (!i.deliveredOn || (!i.liveUrl && (!isProductType(i.productType) || requiresLiveUrl(i.productType)))) return null;
      if (i.liveUrl && !safeUrl(i.liveUrl)?.startsWith("https://")) return null;
      subject = T(L, `Avalon Core Agency — Entrega de ${product}`, `Avalon Core Agency — ${product} delivered`);
      heading = T(L, "Tu producto fue entregado", "Your product has been delivered");
      lines = [T(L, `El ${i.deliveredOn} registramos la entrega de ${product}.`, `On ${i.deliveredOn} we recorded the delivery of ${product}.`),
        ...(i.liveUrl ? [T(L, `Dirección de acceso: ${i.liveUrl}`, `Access URL: ${i.liveUrl}`)] : []),
        T(L, "Por favor, responde a este correo para confirmar que lo recibiste o para indicarnos cualquier observación.", "Please reply to this e-mail to confirm receipt or to share any observation."),
        ...(note ? [note] : [])];
      break;
    case "information_request":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Información necesaria para avanzar con ${product}`, `Avalon Core Agency — Information needed to move ${product} forward`);
      heading = T(L, "Necesitamos tu confirmación", "We need your input");
      lines = [T(L, `Para continuar con ${product} para ${i.companyName} necesitamos la siguiente información:`, `To continue with ${product} for ${i.companyName} we need the following information:`),
        note, T(L, "Puedes responder directamente a este correo. No envíes contraseñas ni claves privadas por correo.", "You can reply directly to this e-mail. Never send passwords or private keys by e-mail.")];
      break;
    case "materials_request": {
      const pending = (i.pending ?? []).map(x => oneLine(x, 160)).filter(Boolean).slice(0, 10);
      if (!pending.length && !note) return null;
      subject = T(L, `Avalon Core Agency — Materiales necesarios para avanzar — ${product}`, `Avalon Core Agency — Materials needed for the next step — ${product}`);
      heading = T(L, "Materiales pendientes", "Outstanding materials");
      lines = [T(L, `Al revisar la preparación de ${product} para ${i.companyName}, identificamos los siguientes elementos pendientes:`,
          `While preparing ${product} for ${i.companyName}, we identified these outstanding items:`),
        ...pending.map(x => `• ${x}`), ...(note ? [note] : []),
        ...(i.nextStep ? [T(L, `Estos materiales nos permitirán continuar con: ${i.nextStep}.`, `They are needed for: ${i.nextStep}.`)] : []),
        T(L, "Verifica que los textos, imágenes y archivos tengan permiso de uso. No envíes contraseñas ni claves privadas: coordinaremos accesos delegados.",
          "Please confirm you have the right to use the copy, images and files. Never send passwords or private keys: we will coordinate delegated access."),
        T(L, "Si algún material todavía no está disponible, avísanos para registrar la dependencia; este mensaje no cambia ninguna fecha contractual.",
          "If something is not yet available, tell us so we can record the dependency; this note does not change any contractual date.")];
      break;
    }
    case "kickoff_confirmation":
      if (!i.nextStep && !note) return null;
      subject = T(L, `Avalon Core Agency — Confirmación de inicio y próximos pasos — ${product}`, `Avalon Core Agency — Project kickoff and next steps — ${product}`);
      heading = T(L, "Kickoff confirmado", "Kickoff confirmed");
      lines = [T(L, `Confirmamos que la fase de kickoff de ${product} para ${i.companyName} está preparada conforme al alcance registrado.`,
          `The kickoff stage for ${product} at ${i.companyName} is ready according to the recorded scope.`),
        T(L, "Revisaremos: objetivos prioritarios, responsables de decisiones, materiales pendientes, dependencias y criterios de validación.",
          "We will cover priorities, authorized decision-makers, missing materials, dependencies and validation criteria."),
        ...(i.nextStep ? [T(L, `Siguiente acción acordada: ${i.nextStep}.`, `Agreed next action: ${i.nextStep}.`)] : []), ...(note ? [note] : []),
        T(L, "Solo confirmaremos fechas vinculantes cuando estén aprobadas por quienes corresponda.", "We will only confirm binding dates once properly approved.")];
      break;
    case "review_request":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Revisión solicitada — ${product}`, `Avalon Core Agency — Review requested — ${product}`);
      heading = T(L, "Tu revisión", "Your review");
      lines = [T(L, `Tenemos lista una entrega parcial de ${product} para tu revisión:`, `A partial delivery of ${product} is ready for your review:`), note,
        T(L, "Responde con tus observaciones concretas (qué, dónde y qué esperas). Las rondas de revisión incluidas son las de tu acuerdo.",
          "Reply with specific feedback (what, where and what you expect). Included review rounds are the ones in your agreement.")];
      break;
    case "approval_request":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Solicitud de aprobación — ${product}`, `Avalon Core Agency — Approval requested — ${product}`);
      heading = T(L, "Necesitamos tu aprobación", "Your approval is needed");
      lines = [T(L, `Para avanzar con ${product} necesitamos tu aprobación expresa sobre:`, `To move ${product} forward we need your explicit approval of:`), note,
        T(L, "Responde «Aprobado» o indícanos los cambios. No interpretamos el silencio como aprobación y nada se publica ni se cobra sin tu confirmación.",
          "Reply “Approved” or tell us what to change. Silence is never taken as approval and nothing is published or charged without your confirmation.")];
      break;
    case "receipt_confirmation":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Confirmamos la recepción — ${product}`, `Avalon Core Agency — Receipt confirmed — ${product}`);
      heading = T(L, "Recibido, gracias", "Received, thank you");
      lines = [T(L, `Confirmamos que recibimos lo siguiente para ${product}:`, `We confirm we received the following for ${product}:`), note,
        T(L, "Lo revisaremos y te avisaremos si falta algo o necesitamos otro formato.", "We will review it and let you know if anything is missing or needs another format.")];
      break;
    case "maintenance_notice":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Aviso de mantenimiento — ${product}`, `Avalon Core Agency — Maintenance notice — ${product}`);
      heading = T(L, "Mantenimiento", "Maintenance");
      lines = [note, T(L, "El alcance del mantenimiento es el indicado en tu contrato; cualquier trabajo adicional requiere tu aprobación previa.",
          "Maintenance scope is the one stated in your agreement; any additional work needs your prior approval."), ...supportLines];
      break;
    case "support_info":
      subject = T(L, "Avalon Core Agency — Cómo contactar a soporte", "Avalon Core Agency — How to reach support");
      heading = T(L, "Información de soporte", "Support information");
      lines = [T(L, `Para ${product}, estos son nuestros canales oficiales:`, `For ${product}, these are our official channels:`), ...supportLines,
        T(L, "Al reportar un problema incluye: qué ocurrió, la URL o sección afectada, la fecha y, si puedes, capturas de pantalla.", "When reporting an issue include: what happened, the affected URL or section, the date and, if possible, screenshots."),
        T(L, "El alcance del soporte y del mantenimiento es el indicado en tu contrato.", "Support and maintenance scope is the one stated in your agreement."), ...(note ? [note] : [])];
      break;
    case "renewal_review":
      if (!note) return null;
      subject = T(L, `Avalon Core Agency — Renovación de ${product} (para revisar)`, `Avalon Core Agency — ${product} renewal (for review)`);
      heading = T(L, "Propuesta de renovación", "Renewal proposal");
      lines = [note, T(L, "Nada se renueva ni se cobra automáticamente: cualquier renovación requiere tu aprobación expresa.", "Nothing renews or is charged automatically: any renewal requires your explicit approval.")];
      break;
  }
  const html = layout(L, { preheader: subject, heading, bodyHtml: p(`${T(L, "Hola", "Hello")}, ${esc(name)}:`) + lines.map(l => p(esc(l))).join(""),
    signer: i.representative, company: i.company, origin: i.origin });
  return { subject, html, text: textLayout(L, [`${T(L, "Hola", "Hello")}, ${name}:`, "", ...lines], i.representative, i.company) };
}

// ── Commercial messages (quote → contract → payment → subscription) ─────────────────────────────────────────────
// Each one states only facts recorded in the CRM (numbers, dates, statuses). No clause, price or promise is added.
export const COMMERCIAL_KINDS = ["quote_sent", "contract_confirmation", "payment_confirmation", "subscription_renewal_notice", "cancellation_confirmation"] as const;
export type CommercialKind = typeof COMMERCIAL_KINDS[number];
export const isCommercialKind = (v: string): v is CommercialKind => (COMMERCIAL_KINDS as readonly string[]).includes(v);
export type CommercialFacts =
  | { kind: "quote_sent"; quoteNumber: string; title: string; validUntil: string; oneTime: string | null; monthly: string | null; currency: string; url: string | null }
  | { kind: "contract_confirmation"; contractTitle: string; verifiedOn: string; effectiveOn: string | null }
  | { kind: "payment_confirmation"; amount: string; currency: string; receivedOn: string; invoiceNumber: string | null }
  | { kind: "subscription_renewal_notice"; product: string; periodEnd: string; amount: string; currency: string; period: "monthly" | "annual"; renewalMode: "manual" | "auto" | "none" }
  | { kind: "cancellation_confirmation"; product: string; endsOn: string; atPeriodEnd: boolean };
export type CommercialInput = { lang: Lang; contactName: string; companyName: string; representative: Signer; company: CompanyContact; origin?: string; note?: string; facts: CommercialFacts };

const money = (amount: string, currency: string, lang: Lang) => {
  const n = Number(amount);
  return Number.isFinite(n) ? new Intl.NumberFormat(lang === "en" ? "en-US" : "es-US", { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD" }).format(n) : "";
};
const isoDay = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "");

/** Returns null when a required recorded fact is missing (the message is never prepared on assumptions). */
export function renderCommercial(i: CommercialInput): Rendered | null {
  const L = i.lang, f = i.facts, name = oneLine(i.contactName, 80), co = oneLine(i.companyName, 120), note = (i.note ?? "").trim().slice(0, 1000);
  let subject: string, heading: string, lines: string[]; let cta: { label: string; url: string } | null = null;
  switch (f.kind) {
    case "quote_sent": {
      const valid = isoDay(f.validUntil);
      if (!f.quoteNumber || !f.title || !valid) return null;
      const one = f.oneTime && Number(f.oneTime) > 0 ? money(f.oneTime, f.currency, L) : "", mon = f.monthly && Number(f.monthly) > 0 ? money(f.monthly, f.currency, L) : "";
      subject = T(L, `Avalon Core Agency — Propuesta ${f.quoteNumber} para ${co}`, `Avalon Core Agency — Proposal ${f.quoteNumber} for ${co}`);
      heading = T(L, "Tu propuesta", "Your proposal");
      lines = [T(L, `Te compartimos la propuesta ${f.quoteNumber} — ${oneLine(f.title, 160)}.`, `Please find proposal ${f.quoteNumber} — ${oneLine(f.title, 160)}.`),
        ...(one ? [T(L, `Inversión inicial: ${one}.`, `One-time investment: ${one}.`)] : []),
        ...(mon ? [T(L, `Mensualidad: ${mon}.`, `Monthly fee: ${mon}.`)] : []),
        T(L, `Vigencia: hasta el ${valid}.`, `Valid until ${valid}.`),
        T(L, "La propuesta no es un contrato: el trabajo empieza después de firmar el acuerdo y confirmar las condiciones de pago.",
          "This proposal is not a contract: work starts after the agreement is signed and payment terms are confirmed."), ...(note ? [note] : [])];
      if (f.url && safeUrl(f.url)) cta = { label: T(L, "Ver propuesta", "View proposal"), url: f.url };
      break;
    }
    case "contract_confirmation": {
      const on = isoDay(f.verifiedOn);
      if (!f.contractTitle || !on) return null;
      subject = T(L, `Avalon Core Agency — Confirmación de contrato — ${co}`, `Avalon Core Agency — Agreement confirmation — ${co}`);
      heading = T(L, "Contrato confirmado", "Agreement confirmed");
      lines = [T(L, `Confirmamos que el ${on} verificamos el acuerdo firmado «${oneLine(f.contractTitle, 160)}».`, `We confirm that on ${on} we verified the signed agreement “${oneLine(f.contractTitle, 160)}”.`),
        ...(isoDay(f.effectiveOn) ? [T(L, `Fecha de inicio registrada: ${isoDay(f.effectiveOn)}.`, `Recorded start date: ${isoDay(f.effectiveOn)}.`)] : []),
        T(L, "El texto firmado es la única referencia de alcance, plazos y condiciones; este correo no lo modifica.", "The signed text is the only reference for scope, timeline and terms; this e-mail does not change it."),
        ...(note ? [note] : [])];
      break;
    }
    case "payment_confirmation": {
      const on = isoDay(f.receivedOn), amt = money(f.amount, f.currency, L);
      if (!on || !amt || Number(f.amount) <= 0) return null;
      subject = T(L, `Avalon Core Agency — Pago recibido — ${co}`, `Avalon Core Agency — Payment received — ${co}`);
      heading = T(L, "Pago confirmado", "Payment confirmed");
      lines = [T(L, `Confirmamos la recepción y verificación de tu pago de ${amt} con fecha ${on}.`, `We confirm we received and verified your payment of ${amt} dated ${on}.`),
        ...(f.invoiceNumber ? [T(L, `Aplicado a la factura ${oneLine(f.invoiceNumber, 40)}.`, `Applied to invoice ${oneLine(f.invoiceNumber, 40)}.`)] : []),
        T(L, "Gracias. Conserva este correo como constancia.", "Thank you. Please keep this e-mail for your records."), ...(note ? [note] : [])];
      break;
    }
    case "subscription_renewal_notice": {
      const end = isoDay(f.periodEnd), amt = money(f.amount, f.currency, L);
      if (!f.product || !end || !amt || f.renewalMode === "none") return null;
      const per = f.period === "annual" ? T(L, "anual", "annual") : T(L, "mensual", "monthly");
      subject = T(L, `Avalon Core Agency — Renovación de ${oneLine(f.product, 80)}`, `Avalon Core Agency — ${oneLine(f.product, 80)} renewal`);
      heading = T(L, "Próxima renovación", "Upcoming renewal");
      lines = [T(L, `El período actual de ${oneLine(f.product, 120)} termina el ${end}. El siguiente período ${per} es de ${amt}.`,
          `The current ${oneLine(f.product, 120)} period ends on ${end}. The next ${per} period is ${amt}.`),
        f.renewalMode === "manual"
          ? T(L, "La renovación requiere tu confirmación: responde a este correo si deseas continuar o hacer cambios.", "Renewal needs your confirmation: reply to this e-mail to continue or to request changes.")
          : T(L, "Se renueva según las condiciones de tu acuerdo firmado. Si deseas cambios o cancelar, responde a este correo antes de esa fecha.",
            "It renews under your signed agreement. To change or cancel, reply to this e-mail before that date."), ...(note ? [note] : [])];
      break;
    }
    case "cancellation_confirmation": {
      const end = isoDay(f.endsOn);
      if (!f.product || !end) return null;
      subject = T(L, `Avalon Core Agency — Confirmación de cancelación — ${oneLine(f.product, 80)}`, `Avalon Core Agency — Cancellation confirmed — ${oneLine(f.product, 80)}`);
      heading = T(L, "Cancelación registrada", "Cancellation recorded");
      lines = [f.atPeriodEnd
          ? T(L, `Registramos la cancelación de ${oneLine(f.product, 120)}. El servicio sigue activo hasta el ${end} y no se renovará.`, `We recorded the cancellation of ${oneLine(f.product, 120)}. Service stays active until ${end} and will not renew.`)
          : T(L, `Registramos la cancelación de ${oneLine(f.product, 120)} con efecto el ${end}.`, `We recorded the cancellation of ${oneLine(f.product, 120)} effective ${end}.`),
        T(L, "Cualquier saldo, reembolso o entrega pendiente se rige por tu acuerdo firmado.", "Any balance, refund or pending delivery is governed by your signed agreement."), ...(note ? [note] : [])];
      break;
    }
  }
  const html = layout(L, { preheader: subject, heading, bodyHtml: p(`${T(L, "Hola", "Hello")}, ${esc(name)}:`) + lines.map(l => p(esc(l))).join(""),
    cta, signer: i.representative, company: i.company, origin: i.origin });
  return { subject, html, text: textLayout(L, [`${T(L, "Hola", "Hello")}, ${name}:`, "", ...lines, ...(cta ? ["", cta.url] : [])], i.representative, i.company) };
}
