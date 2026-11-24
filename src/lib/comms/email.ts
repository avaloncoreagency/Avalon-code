/**
 * AVALON-CLAUDE-CAX-OMEGA-001 — corporate e-mail templates (pure; no I/O, no secrets).
 * Table-based, inline-styled HTML that renders in Gmail/iOS Mail, plus a plain-text alternative. Every value is escaped.
 * The signer always comes from the authenticated identity (official owner names), never from a browser parameter.
 */
import { officialOwnerName, personDisplayName, type DisplayIdentity } from "@/lib/identity/owners";

export type Lang = "es" | "en";
export type Rendered = { subject: string; html: string; text: string };
export type Signer = { name: string; title: string };
/** Corporate contact data (avalon_company_settings). A phone appears only when an owner approved a business number. */
export type CompanyContact = {
  supportEmail: string; supportPhone: string | null; supportHours: string;
  replyTo: string; clientSender: string; inviteSender: string; inviteSenderVerified: boolean;
};
export const DEFAULT_COMPANY: CompanyContact = {
  supportEmail: "avalonagencymh@gmail.com", supportPhone: null, supportHours: "",
  replyTo: "avalonagencymh@gmail.com", clientSender: "avalonagencymh@gmail.com",
  inviteSender: "avalonacoreagency@gmail.com", inviteSenderVerified: false,
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
