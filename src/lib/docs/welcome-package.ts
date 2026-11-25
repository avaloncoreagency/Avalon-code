import { renderEditorialPdf } from "./library-pdf";

/**
 * Client Welcome Package (AVL-CLAUDE-GENESIS-001 · G04). A per-client PDF built ONLY from canonical records: client and
 * contact, the onboarding's service, the verified signed agreement (reference only, never the legal text), the issued
 * invoice number, the recorded next step, the service checklist, the corporate support channels and the client documents
 * the owners APPROVED in the library. Pending legal/department documents and products that do not exist are never
 * included, and nothing is promised that was not recorded. The snapshot is stored with its sha256 like a manual, so the
 * exact bytes that were reviewed are the bytes that are downloaded or attached.
 */
export const WELCOME_GENERATOR = "avalon-welcome-1";
export type WelcomeLang = "es" | "en";
export type WelcomeSnapshot = {
  schema: "avalon-welcome-1"; lang: WelcomeLang; version: number; issuedOn: string;
  client: { contactName: string; companyName: string };
  service: { label: string; title: string };
  representative: { name: string; title: string };
  contract: { verified: boolean; ref: string };
  invoice: { number: string } | null;
  nextStep: { text: string; confirmedOn: string | null } | null;
  checklist: { pending: string[]; done: number; total: number };
  support: { email: string; phone: string | null; hours: string };
  documents: { id: string; title: string }[];
};

const line = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const T = (l: WelcomeLang, es: string, en: string) => (l === "en" ? en : es);

export function buildWelcomePackage(i: Omit<WelcomeSnapshot, "schema">): WelcomeSnapshot {
  return {
    schema: "avalon-welcome-1", lang: i.lang === "en" ? "en" : "es", version: Math.max(1, Math.floor(i.version)), issuedOn: line(i.issuedOn, 10),
    client: { contactName: line(i.client.contactName, 120), companyName: line(i.client.companyName, 160) },
    service: { label: line(i.service.label, 80), title: line(i.service.title, 160) },
    representative: { name: line(i.representative.name, 120), title: line(i.representative.title, 80) },
    contract: { verified: i.contract.verified === true, ref: i.contract.verified ? line(i.contract.ref, 80) : "" },
    invoice: i.invoice && line(i.invoice.number, 40) ? { number: line(i.invoice.number, 40) } : null,
    nextStep: i.nextStep && line(i.nextStep.text, 240) ? { text: line(i.nextStep.text, 240), confirmedOn: i.nextStep.confirmedOn ? line(i.nextStep.confirmedOn, 10) : null } : null,
    checklist: { pending: i.checklist.pending.map(x => line(x, 200)).filter(Boolean).slice(0, 20), done: Math.max(0, i.checklist.done | 0), total: Math.max(0, i.checklist.total | 0) },
    support: { email: line(i.support.email, 254), phone: i.support.phone ? line(i.support.phone, 40) : null, hours: line(i.support.hours, 200) },
    documents: i.documents.map(d => ({ id: line(d.id, 40), title: line(d.title, 160) })).filter(d => d.id && d.title).slice(0, 12),
  };
}

export function isWelcomeSnapshot(v: unknown): v is WelcomeSnapshot {
  const o = v as WelcomeSnapshot | null;
  return !!o && typeof o === "object" && o.schema === "avalon-welcome-1" && (o.lang === "es" || o.lang === "en") && typeof o.version === "number"
    && !!o.client && !!o.service && !!o.representative && !!o.contract && !!o.checklist && Array.isArray(o.checklist.pending)
    && !!o.support && Array.isArray(o.documents);
}

/** Markdown (rendered by the shared ivory editorial renderer); every sentence is either fixed or a recorded value. */
export function welcomeMarkdown(w: WelcomeSnapshot): string {
  const L = w.lang, out: string[] = [];
  out.push(`# ${T(L, "Bienvenido a Avalon Core Agency", "Welcome to Avalon Core Agency")}`, "",
    `${T(L, "Hola", "Hello")}, ${w.client.contactName || w.client.companyName}:`, "",
    T(L, `Gracias por confiar en Avalon Core Agency para ${w.service.title}. Este paquete reúne lo que necesitas para empezar: tu servicio, el estado de tu acuerdo, lo que necesitamos de ti y cómo comunicarte con nosotros.`,
      `Thank you for choosing Avalon Core Agency for ${w.service.title}. This package gathers what you need to get started: your service, the status of your agreement, what we need from you and how to reach us.`), "");
  out.push(`## ${T(L, "Tu servicio", "Your service")}`,
    `- ${T(L, "Servicio", "Service")}: ${w.service.label} — ${w.service.title}`,
    `- ${T(L, "Empresa", "Company")}: ${w.client.companyName}`,
    ...(w.representative.name ? [`- ${T(L, "Responsable", "Account lead")}: ${w.representative.name}${w.representative.title ? ` (${w.representative.title})` : ""}`] : []),
    `- ${T(L, "Fecha de emisión", "Issued on")}: ${w.issuedOn} · v${w.version}`, "");
  out.push(`## ${T(L, "Tu acuerdo", "Your agreement")}`,
    w.contract.verified
      ? T(L, `Acuerdo firmado y verificado: ${w.contract.ref}. Su texto firmado es la referencia de alcance, plazos, pagos, revisiones, soporte y mantenimiento.`,
        `Signed and verified agreement: ${w.contract.ref}. Its signed text is the reference for scope, timeline, payments, reviews, support and maintenance.`)
      : T(L, "Tu acuerdo se gestiona por separado. Este paquete no sustituye, resume ni modifica sus condiciones.",
        "Your agreement is handled separately. This package does not replace, summarise or change its terms."), "");
  if (w.invoice) out.push(`## ${T(L, "Factura", "Invoice")}`,
    T(L, `Factura emitida: ${w.invoice.number}. Las condiciones de pago son las de tu acuerdo y tu factura.`, `Issued invoice: ${w.invoice.number}. Payment terms are those of your agreement and your invoice.`), "");
  if (w.nextStep) out.push(`## ${T(L, "Próximo paso", "Next step")}`,
    `${w.nextStep.text}${w.nextStep.confirmedOn ? T(L, ` (confirmado para ${w.nextStep.confirmedOn})`, ` (confirmed for ${w.nextStep.confirmedOn})`) : ""}`, "");
  out.push(`## ${T(L, "Lo que necesitamos de ti", "What we need from you")}`,
    ...(w.checklist.pending.length ? w.checklist.pending.map(x => `- ${x}`) : [T(L, "No hay pendientes registrados en este momento.", "No pending items are recorded right now.")]),
    ...(w.checklist.total ? ["", T(L, `Avance de la preparación: ${w.checklist.done} de ${w.checklist.total} puntos completados.`, `Preparation progress: ${w.checklist.done} of ${w.checklist.total} items completed.`)] : []), "");
  out.push(`## ${T(L, "Cómo trabajamos", "How we work")}`,
    `- ${T(L, `Te escribiremos desde ${w.support.email}; responde a ese mismo correo para que todo quede registrado.`, `We will write from ${w.support.email}; reply to that same address so everything is recorded.`)}`,
    `- ${T(L, "Nunca te pediremos contraseñas por correo: coordinaremos accesos delegados.", "We will never ask for passwords by e-mail: we coordinate delegated access.")}`,
    `- ${T(L, "Comparte solo textos, imágenes y archivos que tengas derecho a usar.", "Share only copy, images and files you have the right to use.")}`,
    `- ${T(L, "Nada se publica ni se cobra sin tu aprobación expresa.", "Nothing is published or charged without your explicit approval.")}`, "");
  out.push(`## ${T(L, "Soporte", "Support")}`, `- ${T(L, "Correo", "E-mail")}: ${w.support.email}`,
    ...(w.support.phone ? [`- ${T(L, "Teléfono", "Phone")}: ${w.support.phone}`] : []), ...(w.support.hours ? [`- ${T(L, "Horario", "Hours")}: ${w.support.hours}`] : []), "");
  out.push(`## ${T(L, "Documentos incluidos", "Included documents")}`,
    ...(w.documents.length ? w.documents.map(d => `- ${d.id} · ${d.title}`)
      : [T(L, "Los documentos de bienvenida y los manuales se compartirán cuando estén aprobados y disponibles.", "Welcome documents and manuals will be shared once they are approved and available.")]), "");
  out.push("---", T(L, "Atentamente,", "Best regards,"), `${w.representative.name || "Avalon Core Agency"}${w.representative.title ? ` · ${w.representative.title}` : ""} · Avalon Core Agency`);
  return out.join("\n");
}

export function renderWelcomePackagePdf(w: WelcomeSnapshot): Uint8Array {
  return renderEditorialPdf({ ref: "WELCOME", version: String(w.version), languages: [w.lang],
    title: T(w.lang, `Paquete de bienvenida — ${w.client.companyName}`, `Welcome Package — ${w.client.companyName}`), markdown: welcomeMarkdown(w),
    status: { label: T(w.lang, "PAQUETE DE BIENVENIDA", "WELCOME PACKAGE"), warn: false }, producer: `Avalon OS ${WELCOME_GENERATOR}` });
}

export const welcomeFileName = (w: WelcomeSnapshot) =>
  `Avalon-Welcome-${w.client.companyName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "Client"}-v${w.version}.pdf`;
