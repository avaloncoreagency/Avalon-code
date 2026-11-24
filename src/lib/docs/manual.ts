/**
 * Client product manuals (pure). A manual is built ONLY from recorded facts (client, product, real URL, agreed scope,
 * support contacts). Templates describe how to use and request support; they never promise a feature that is not in
 * the delivered product, never include passwords, and state explicitly what is excluded or depends on third parties.
 * The snapshot is frozen in crm_client_documents; the PDF is re-rendered byte-for-byte from it (sha256 verified).
 */
import { textWidth } from "@/lib/quotes/pdf";
import { PRODUCT_LABEL, type ProductType } from "@/lib/onboarding/model";

export const MANUAL_GENERATOR = "avalon-manual-1";
export type Lang = "es" | "en";
export type ManualSection = { heading: string; paragraphs: string[]; bullets: string[] };
export type ManualSnapshot = {
  schemaVersion: 1; generator: typeof MANUAL_GENERATOR; lang: Lang;
  client: { name: string; company: string }; product: { type: ProductType; name: string; url: string; version: number };
  issuedOn: string; responsible: string; contractRef: string;
  support: { email: string; phone: string | null; hours: string };
  sections: ManualSection[];
};
export type ManualInput = {
  lang: Lang; clientName: string; companyName: string; productType: ProductType; productName: string; liveUrl: string;
  version: number; issuedOn: string; responsible: string; contractRef: string; scope: string; exclusions: string;
  support: { email: string; phone: string | null; hours: string }; maintenance: string; warranty: string;
};

const T = (l: Lang, es: string, en: string) => (l === "es" ? es : en);
const tidy = (s: string, max = 3000) => s.replace(/\u0000/g, "").trim().slice(0, max);

/** Product-specific daily-use guidance: generic operations of the delivered product type, no invented features. */
function productGuide(l: Lang, type: ProductType): ManualSection[] {
  const S = (heading: string, paragraphs: string[], bullets: string[] = []): ManualSection => ({ heading, paragraphs, bullets });
  switch (type) {
    case "website": return [S(T(l, "Uso diario del sitio web", "Using your website"), [T(l, "Su sitio web está publicado en la dirección indicada en este manual. Los cambios de contenido se solicitan a Avalon por el canal de soporte, salvo que su contrato incluya un panel de edición.", "Your website is published at the address in this manual. Content changes are requested from Avalon through support, unless your agreement includes an editing panel.")],
      [T(l, "Revise periódicamente que sus datos de contacto, horarios y precios sigan siendo correctos.", "Periodically check that contact details, hours and prices are still correct."), T(l, "Pruebe los formularios después de cualquier cambio y confirme que recibe los mensajes.", "Test forms after any change and confirm you receive the messages."), T(l, "Conserve la propiedad y el acceso a su dominio y a la cuenta de hosting a su nombre.", "Keep ownership of and access to your domain and hosting account in your name.")])];
    case "ecommerce": return [S(T(l, "Operación de la tienda", "Operating your store"), [T(l, "Usted, como comerciante, es responsable de precios, inventario, impuestos, envíos, devoluciones y de su cuenta del proveedor de pagos. Avalon no procesa cobros en su nombre.", "As the merchant you are responsible for prices, inventory, taxes, shipping, returns and your payment-provider account. Avalon does not process payments on your behalf.")],
      [T(l, "Actualice el inventario y los precios antes de cada campaña.", "Update inventory and prices before each campaign."), T(l, "Verifique cada pedido de prueba y reembolso en el entorno de pruebas antes de cambios mayores.", "Verify a test order and refund in the sandbox before major changes."), T(l, "Revise sus políticas de devoluciones y términos comerciales con su asesor.", "Review your returns policy and commercial terms with your advisor.")])];
    case "crm": return [S(T(l, "Uso diario del CRM", "Using your CRM"), [T(l, "El CRM organiza sus clientes, oportunidades y tareas según los roles acordados. Cada usuario debe tener su propia cuenta; no comparta credenciales.", "The CRM organizes your clients, opportunities and tasks according to the agreed roles. Every user must have their own account; never share credentials.")],
      [T(l, "Registre cada cliente una sola vez y busque antes de crear uno nuevo para evitar duplicados.", "Register each client once and search before creating one to avoid duplicates."), T(l, "Mueva las oportunidades de etapa solo cuando ocurra el hecho real.", "Move opportunities between stages only when the real event happens."), T(l, "Dé de baja de inmediato a los usuarios que dejen su empresa.", "Remove users who leave your company immediately.")])];
    case "marketing": return [S(T(l, "Campañas y medición", "Campaigns and measurement"), [T(l, "Las campañas se ejecutan con el presupuesto que usted aprueba por escrito y que se paga directamente a las plataformas. Los resultados varían y no están garantizados.", "Campaigns run on the budget you approve in writing, paid directly to the platforms. Results vary and are not guaranteed.")],
      [T(l, "Apruebe cada afirmación publicitaria y asegúrese de poder respaldarla.", "Approve every advertising claim and make sure you can substantiate it."), T(l, "Consulte los KPI acordados en el reporte; un dato no disponible se informa como desconocido.", "Review the agreed KPIs in the report; unavailable data is reported as unknown.")])];
    case "ai_tools": return [S(T(l, "Herramientas de IA", "AI tools"), [T(l, "Las respuestas automáticas pueden contener errores y requieren supervisión humana. Esta herramienta solo opera cuando los propietarios de Avalon autorizan su activación.", "Automated answers can contain errors and require human oversight. This tool only operates once Avalon's owners authorize its activation.")],
      [T(l, "Revise periódicamente la base de conocimiento.", "Review the knowledge base periodically."), T(l, "Mantenga los avisos de privacidad visibles para sus usuarios finales.", "Keep privacy notices visible to your end users.")])];
    default: return [S(T(l, "Uso del servicio", "Using the service"), [T(l, "Las instrucciones específicas de este servicio se acuerdan en su contrato y se documentan en las entregas.", "Service-specific instructions are agreed in your agreement and documented with each delivery.")])];
  }
}

export function buildManual(i: ManualInput): ManualSnapshot {
  const l = i.lang, S = (heading: string, paragraphs: string[], bullets: string[] = []): ManualSection => ({ heading, paragraphs: paragraphs.filter(Boolean), bullets: bullets.filter(Boolean) });
  const notRecorded = T(l, "Según su contrato (no registrado en este documento).", "Per your agreement (not recorded in this document).");
  const sections: ManualSection[] = [
    S(T(l, "Introducción", "Introduction"), [T(l, `Este manual describe ${PRODUCT_LABEL[i.productType][0].toLowerCase()} entregado a ${i.companyName}: qué recibió, para qué sirve y cómo obtener soporte.`, `This manual describes the ${PRODUCT_LABEL[i.productType][1].toLowerCase()} delivered to ${i.companyName}: what you received, what it is for and how to get support.`),
      T(l, "Alcance entregado:", "Delivered scope:") + " " + (tidy(i.scope) || notRecorded)]),
    S(T(l, "Acceso", "Access"), [i.liveUrl ? T(l, `Dirección: ${i.liveUrl}`, `Address: ${i.liveUrl}`) : T(l, "La dirección se confirma en la entrega.", "The address is confirmed at delivery.")],
      [T(l, "Sus credenciales se entregan por un canal privado separado; este documento no contiene contraseñas.", "Your credentials are delivered through a separate private channel; this document contains no passwords."),
        T(l, "Use la opción «¿Olvidaste tu contraseña?» del propio acceso para recuperarla.", "Use the login's own \"Forgot password\" option to recover access."),
        T(l, "Active la verificación en dos pasos cuando el servicio la ofrezca.", "Enable two-step verification whenever the service offers it.")]),
    S(T(l, "Primeros pasos", "Getting started"), [], [T(l, "Confirme que puede iniciar sesión y que sus datos de negocio son correctos.", "Confirm you can sign in and that your business details are correct."), T(l, "Comunique a Avalon cualquier diferencia con el alcance acordado dentro del periodo de revisión.", "Report any difference from the agreed scope to Avalon within the review period.")]),
    ...productGuide(l, i.productType),
    S(T(l, "Gestión de usuarios", "User management"), [T(l, "Si su producto incluye varios usuarios, cada persona debe tener su propia cuenta con el mínimo permiso necesario. Retire el acceso de inmediato cuando alguien deje su empresa.", "If your product supports several users, each person needs their own account with the least privilege required. Remove access immediately when someone leaves your company.")]),
    S(T(l, "Mantenimiento", "Maintenance"), [T(l, "Cubierto por Avalon:", "Covered by Avalon:") + " " + (tidy(i.maintenance, 1200) || T(l, "solo lo indicado expresamente en su contrato; sin contrato de mantenimiento no hay soporte continuo incluido.", "only what your agreement expressly states; without a maintenance agreement no ongoing support is included.")),
      T(l, "Corresponde al cliente: contenido, datos, cuentas a su nombre y costos de terceros (dominio, hosting, licencias, publicidad).", "Client responsibility: content, data, accounts in your name and third-party costs (domain, hosting, licenses, advertising)."),
      T(l, "Depende de terceros: plataformas, proveedores de pago, buscadores y redes sociales pueden cambiar sus reglas o tener interrupciones fuera del control de Avalon.", "Third-party dependencies: platforms, payment providers, search engines and social networks may change their rules or have outages outside Avalon's control.")]),
    S(T(l, "Errores comunes", "Common issues"), [], [T(l, "No puedo entrar: use la recuperación de contraseña; si persiste, escriba a soporte indicando la hora y el mensaje de error.", "I can't sign in: use password recovery; if it persists, email support with the time and the error message."),
      T(l, "Un formulario no llega: revise la carpeta de spam y confirme el correo de destino con soporte.", "A form is not arriving: check spam and confirm the destination address with support."),
      T(l, "La página no carga: compruebe su conexión y el estado del dominio/hosting; luego contacte a soporte.", "The page does not load: check your connection and the domain/hosting status; then contact support.")]),
    S(T(l, "Seguridad", "Security"), [], [T(l, "Nunca comparta contraseñas por correo ni chat; Avalon no se las pedirá.", "Never share passwords by email or chat; Avalon will not ask for them."),
      T(l, "Conceda accesos delegados nominales y retírelos al terminar.", "Grant named delegated access and revoke it when finished."),
      T(l, "Trate los datos personales según su aviso de privacidad y la ley aplicable.", "Handle personal data according to your privacy notice and applicable law."),
      T(l, "Copias de seguridad: solo las incluidas en su contrato.", "Backups: only those included in your agreement.")]),
    S(T(l, "Soporte", "Support"), [`Email: ${i.support.email}`, i.support.phone ? `${T(l, "Teléfono", "Phone")}: ${i.support.phone}` : "", i.support.hours ? `${T(l, "Horario", "Hours")}: ${i.support.hours}` : "",
      T(l, "Los tiempos de respuesta y niveles de servicio aplican solo si su contrato los establece.", "Response times and service levels apply only if your agreement sets them.")]),
    S(T(l, "Condiciones y limitaciones", "Terms and limitations"), [T(l, "No incluido:", "Not included:") + " " + (tidy(i.exclusions) || notRecorded),
      T(l, "Garantía:", "Warranty:") + " " + (tidy(i.warranty, 800) || T(l, "la garantía limitada de trabajo de su contrato.", "the limited workmanship warranty in your agreement.")),
      T(l, "Avalon no garantiza ventas, leads, posicionamiento, retorno de inversión ni aprobación de anuncios por terceros.", "Avalon does not guarantee sales, leads, rankings, return on investment or third-party ad approval."),
      T(l, `Referencia contractual: ${i.contractRef || T(l, "contrato vigente con Avalon", "your agreement with Avalon")}. En caso de diferencia, prevalece el contrato.`, `Contract reference: ${i.contractRef || T(l, "your agreement with Avalon", "your agreement with Avalon")}. If they differ, the agreement prevails.`)]),
  ];
  return { schemaVersion: 1, generator: MANUAL_GENERATOR, lang: l, client: { name: tidy(i.clientName, 160), company: tidy(i.companyName, 160) },
    product: { type: i.productType, name: tidy(i.productName, 160), url: tidy(i.liveUrl, 500), version: i.version }, issuedOn: i.issuedOn,
    responsible: tidy(i.responsible, 160), contractRef: tidy(i.contractRef, 160), support: i.support, sections };
}

export function isManualSnapshot(v: unknown): v is ManualSnapshot {
  const o = v as ManualSnapshot;
  return !!o && o.schemaVersion === 1 && o.generator === MANUAL_GENERATOR && (o.lang === "es" || o.lang === "en") && Array.isArray(o.sections)
    && typeof o.client?.company === "string" && typeof o.product?.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.issuedOn);
}

export const manualFileName = (s: ManualSnapshot) => `Avalon-Manual-${s.product.name}-v${s.product.version}.pdf`.replace(/[^A-Za-z0-9._-]+/g, "-");

// ── PDF (US Letter, dependency-free, deterministic: same snapshot → same bytes) ────────────────────────────────────
const W = 612, H = 792, M = 56;
const NAVY = "0.035 0.067 0.161", INK = "0.118 0.153 0.243", MUTED = "0.42 0.45 0.53", BLUE = "0.208 0.329 1", VIOLET = "0.478 0.361 1", RULE = "0.88 0.9 0.94", WHITE = "1 1 1";
const clean = (s: string) => s.normalize("NFC").replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const esc = (s: string) => clean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function renderManualPdf(m: ManualSnapshot): Uint8Array {
  const T2 = (es: string, en: string) => (m.lang === "es" ? es : en);
  const pages: string[][] = [];
  let ops: string[] = []; pages.push(ops);
  let y = H;
  const text = (x: number, yy: number, s: string, z: number, bold = false, col = INK) => ops.push("BT", `/${bold ? "F2" : "F1"} ${z} Tf`, col + " rg", `1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm`, "(" + esc(s) + ") Tj", "ET");
  const rect = (x: number, yy: number, w: number, h: number, col: string) => ops.push("q", col + " rg", `${x} ${yy} ${w} ${h} re f`, "Q");
  // Official Avalon mark (same geometry as the site logo), drawn as vector polygons.
  const mark = (x: number, yy: number, size: number) => {
    const k = size / 140, P = (px: number, py: number) => `${(x + px * k).toFixed(2)} ${(yy + (130 - py) * k).toFixed(2)}`;
    ops.push("q", BLUE + " rg", `${P(70, 12)} m ${P(131, 112)} l ${P(99, 112)} l ${P(70, 62)} l ${P(40, 112)} l ${P(9, 112)} l h f`, VIOLET + " rg", `${P(70, 79)} m ${P(91, 115)} l ${P(49, 115)} l h f`, "Q");
  };
  const wrap = (s: string, size: number, max: number, bold = false) => {
    const out: string[] = []; let line = "";
    for (const word of clean(s).split(/\s+/).filter(Boolean)) {
      const cand = line ? line + " " + word : word;
      if (textWidth(cand, size, bold ? "F2" : "F1") <= max) line = cand;
      else { if (line) out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };
  const newPage = () => { ops = []; pages.push(ops); y = H - 70; };
  const need = (h: number) => { if (y - h < 70) newPage(); };

  // Cover
  rect(0, 0, W, H, NAVY); rect(0, H - 6, W, 6, BLUE);
  mark(M, H - 170, 70);
  text(M + 84, H - 128, "AVALON", 26, true, WHITE); text(M + 85, H - 146, "CORE AGENCY", 9, true, "0.74 0.8 0.95");
  text(M, 470, T2("MANUAL DEL PRODUCTO", "PRODUCT MANUAL"), 12, true, "0.74 0.8 0.95");
  wrap(m.product.name, 28, W - 2 * M, true).slice(0, 3).forEach((l, n) => text(M, 430 - n * 34, l, 28, true, WHITE));
  const meta: [string, string][] = [[T2("Cliente", "Client"), m.client.name], [T2("Empresa", "Company"), m.client.company], [T2("Producto", "Product"), T2(PRODUCT_LABEL[m.product.type][0], PRODUCT_LABEL[m.product.type][1])],
    [T2("Versión", "Version"), "v" + m.product.version], [T2("Fecha", "Date"), m.issuedOn], [T2("Responsable", "Owner"), m.responsible || "—"]];
  meta.forEach(([k, v], n) => { text(M, 300 - n * 22, k.toUpperCase(), 8, true, "0.6 0.66 0.82"); text(M + 120, 300 - n * 22, wrap(v, 11, W - 2 * M - 120)[0] ?? "", 11, false, WHITE); });
  text(M, 90, T2("Documento privado del cliente. No contiene contraseñas.", "Private client document. Contains no passwords."), 9, false, "0.6 0.66 0.82");

  // Body
  newPage();
  for (const sec of m.sections) {
    need(48);
    text(M, y, sec.heading, 15, true, NAVY); y -= 8; rect(M, y, 36, 2, BLUE); y -= 18;
    for (const para of sec.paragraphs) {
      for (const l of wrap(para, 10.5, W - 2 * M)) { need(15); text(M, y, l, 10.5); y -= 15; }
      y -= 6;
    }
    for (const b of sec.bullets) {
      const lines = wrap(b, 10.5, W - 2 * M - 16);
      lines.forEach((l, n) => { need(15); if (n === 0) rect(M + 2, y + 3, 4, 4, VIOLET); text(M + 16, y, l, 10.5); y -= 15; });
      y -= 3;
    }
    y -= 12;
  }

  // Serialize (deterministic: no timestamps beyond the snapshot)
  const objects: string[] = []; const add = (s: string) => { objects.push(s); return objects.length; };
  const catalog = add(""), root = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((p, i) => {
    const foot = i === 0 ? [] : ["q", RULE + " rg", `${M} 48 ${W - 2 * M} 0.6 re f`, "Q", "BT", "/F1 7.5 Tf", MUTED + " rg", `1 0 0 1 ${M} 34 Tm`,
      "(" + esc(`Avalon Core Agency  |  ${m.product.name} v${m.product.version}  |  ${m.issuedOn}  |  ${T2("Página", "Page")} ${i + 1} / ${pages.length}`) + ") Tj", "ET"];
    const stream = [...p, ...foot].join("\n") + "\n";
    const content = add("<< /Length " + Buffer.byteLength(stream, "latin1") + " >>\nstream\n" + stream + "endstream");
    kids.push(add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  const info = add(`<< /Title (${esc(T2("Manual ", "Manual ") + m.product.name)}) /Producer (Avalon OS ${MANUAL_GENERATOR}) >>`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${root} 0 R >>`;
  objects[root - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
