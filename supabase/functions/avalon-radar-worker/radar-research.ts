// Shared Avalon Radar research implementation; sync changes with src/lib/crm/radar-research.ts.
import {
  ResearchBlocked,
  checkRobots,
  fetchPublicPage,
  websiteUrl,
  MAX_RESEARCH_PAGES,
  type FetchedPage,
} from "./radar-website-safety.ts";

export type ResearchSignal = {
  code: string;
  label: string;
  outcome: "observed" | "not_observed" | "unknown";
  detail: string;
  source_url: string;
  confidence: "low" | "medium" | "high";
  checked_at: string;
};
export type ResearchPage = { url: string; status: number; title: string; kind: string };
export type ResearchReport = {
  status: "complete" | "limited" | "blocked";
  website: string;
  researched_at: string;
  pages: ResearchPage[];
  signals: ResearchSignal[];
  warnings: string[];
  confidence: "none" | "low" | "medium" | "high";
  identity_matched: boolean;
  unverified: string[];
  suggested_needs: Array<{
    service: "website" | "ecommerce";
    state: "verified_present" | "opportunity_to_improve";
    method: "website_review";
    evidence_url: string;
    confidence: "medium" | "high";
    note: string;
  }>;
};

const UNKNOWN_BY_PUBLIC_WEB = [
  "Uso interno de CRM o calidad del seguimiento",
  "Si usa recepcionista de IA o quién responde llamadas",
  "Presupuesto y resultados reales de marketing",
  "Necesidad de rediseñar toda la web",
  "Intención y presupuesto de compra del negocio",
];
const TECHNICAL_PATHS = /\/(wp-admin|admin|login|logout|sign-in|signin|cart|checkout|account|api|graphql|search|feed|sitemap|robots\.txt)(\/|$)/i;
const SELECTED_PATH = /(contact|contacto|about|acerca|nosotros|team|services|servicios|treatments|tratamientos|appointment|booking|reserv|citas|shop|store|tienda|products|productos)/i;

function readable(value: string, max = 190): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, max);
}

function titleFromHTML(html: string): string {
  return readable(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "", 180);
}
function metaDescription(html: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/\bname\s*=\s*["']?description["']?/i.test(tag)) continue;
    const value = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (value) return readable(value[1] ?? value[2] ?? value[3] ?? "", 220);
  }
  return "";
}
function normalizedTokens(input: string): string[] {
  const skip = new Set(["the", "and", "for", "of", "de", "del", "la", "las", "los", "el", "llc", "inc",
    "clinic", "clinica", "dental", "dentist", "doctor", "dr", "miami", "florida", "group", "center"]);
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter(v => v.length >= 4 && !skip.has(v)).slice(0, 8);
}
export function businessIdentityMatches(name: string, html: string): boolean {
  const words = normalizedTokens(name);
  if (!words.length) return false;
  const excerpt = (titleFromHTML(html) + " " + readable(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "", 200))
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return words.filter(word => excerpt.includes(word)).length >= Math.min(2, words.length);
}

function linksFrom(html: string, base: URL): Array<{ href: string; label: string }> {
  const links: Array<{ href: string; label: string }> = [];
  const a = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = a.exec(html)) && links.length < 140) {
    try {
      const url = new URL((match[1] ?? match[2] ?? "").replace(/&amp;/g, "&"), base);
      if (url.protocol !== "https:" || url.hostname !== base.hostname || url.username || url.password) continue;
      url.hash = "";
      const label = readable(match[3] ?? "", 100);
      if (url.pathname.length > 180 || url.search.length > 100 || TECHNICAL_PATHS.test(url.pathname)) continue;
      links.push({ href: url.href, label });
    } catch { /* Invalid links are not evidence. */ }
  }
  return links;
}

export function chooseResearchPages(html: string, base: URL): string[] {
  const links = linksFrom(html, base);
  const weighted = links.filter(l => SELECTED_PATH.test(l.href + " " + l.label))
    .map(l => {
      const text = l.href.toLowerCase() + " " + l.label.toLowerCase();
      const weight = /contact|contacto|citas|book|appoint|reserv/.test(text) ? 5 :
        /services|servicios|treatments|tratamientos|shop|store|tienda/.test(text) ? 4 : 2;
      return { ...l, weight };
    })
    .sort((a, b) => b.weight - a.weight);
  const seen = new Set([base.href]);
  const output: string[] = [];
  for (const link of weighted) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    output.push(link.href);
    if (output.length >= MAX_RESEARCH_PAGES - 1) break;
  }
  return output;
}

export function analyzeWebsitePages(company: string, input: FetchedPage[], checkedAt: string,
  warnings: string[] = []): ResearchReport {
  const first = input[0];
  const homepage = first?.url ?? "";
  const successful = input.filter(page => page.status === 200 && /html/.test(page.contentType));
  const allHTML = successful.map(p => p.text).join(" ");
  const head = successful[0]?.text ?? "";
  const firstTitle = titleFromHTML(head);
  const identity = !!head && businessIdentityMatches(company, head);
  const pages: ResearchPage[] = input.map((p,i) => ({ url: p.url, status: p.status,
    title: titleFromHTML(p.text), kind: i === 0 ? "inicio" : "sección interna" }));
  const signals: ResearchSignal[] = [];
  const push = (code: string, label: string, outcome: ResearchSignal["outcome"],
    detail: string, sourceUrl: string, confidence: ResearchSignal["confidence"]) =>
    signals.push({ code, label, outcome, detail: detail.slice(0, 250), source_url: sourceUrl,
      confidence, checked_at: checkedAt });

  if (!successful.length) {
    push("website_reachable", "Respuesta de la web", "unknown",
      "No se pudo obtener HTML público verificable. Una caída temporal no demuestra que el negocio no tenga sitio web.",
      homepage, "low");
  } else {
    push("website_reachable", "Sitio web responde con HTTPS", "observed",
      "Se obtuvo una página HTML pública por HTTPS en la fecha indicada.", successful[0].url, "high");
    push("business_identity", "Relación con el negocio", identity ? "observed" : "unknown",
      identity ? "El nombre comercial coincide con el título o encabezado visible." :
      "El título/encabezado no confirma que este sitio pertenezca al negocio; requiere revisión manual.",
      successful[0].url, identity ? "medium" : "low");
    push("seo_title", "Título visible de la página", firstTitle ? "observed" : "not_observed",
      firstTitle ? "Título: " + firstTitle : "No apareció una etiqueta title en el HTML consultado.",
      successful[0].url, "high");
    const desc = metaDescription(head);
    push("seo_meta_description", "Meta descripción (SEO básico)", desc ? "observed" : "not_observed",
      desc ? "Meta descripción visible: " + desc :
        "No apareció meta description en el HTML consultado. Esto es un hallazgo técnico, NO prueba ausencia de marketing.",
      successful[0].url, "medium");
    const viewport = /<meta\b[^>]*name\s*=\s*["']?viewport["']?/i.test(head);
    push("mobile_viewport", "Etiqueta viewport móvil", viewport ? "observed" : "not_observed",
      viewport ? "El HTML declara viewport; esto no demuestra que la web sea realmente adaptable." :
        "No se encontró viewport en el HTML consultado; verificar en un teléfono antes de recomendar rediseño.",
      successful[0].url, "medium");
    const links = successful.flatMap(p => linksFrom(p.text, new URL(p.url)).map(l => ({ ...l, source: p.url })));
    const book = links.find(l => /book|appointment|schedule|reserv|cita/i.test(l.href + " " + l.label));
    push("booking_link", "Enlace de citas o reservas", book ? "observed" : "unknown",
      book ? "Se encontró un enlace anunciado para citas o reservas; no se comprobó el proceso completo." :
        "No se vio un enlace de reservas en las páginas consultadas; podría existir en otra sección.",
      book?.source ?? successful[0].url, book ? "medium" : "low");
    const contact = links.find(l => /contact|contacto/i.test(l.href + " " + l.label));
    push("contact_page", "Página de contacto", contact ? "observed" : "unknown",
      contact ? "El sitio enlaza una página de contacto." :
        "No se localizó un enlace de contacto en el contenido consultado; no demuestra su ausencia.",
      contact?.source ?? successful[0].url, contact ? "medium" : "low");
    const shop = /"@type"\s*:\s*"Product"/i.test(allHTML) &&
      /href\s*=\s*["'][^"']*\/(?:cart|checkout|add-to-cart)/i.test(allHTML);
    const storeLink = links.find(l => /store|tienda|shop|products|productos/i.test(l.href + " " + l.label));
    push("storefront", "Indicios de tienda en línea", shop || storeLink ? "observed" : "unknown",
      shop ? "Aparecen datos estructurados Product y enlace de carrito/compra." :
        storeLink ? "Se observó enlace a tienda o productos; el pago en línea sigue sin verificar." :
        "No se observó una tienda en las páginas consultadas; no demuestra que no exista.",
      storeLink?.source ?? successful[0].url, shop ? "medium" : "low");
    const social = /href\s*=\s*["']https:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|linkedin\.com|tiktok\.com)\//i.test(allHTML);
    push("social_links", "Enlaces a redes sociales", social ? "observed" : "unknown",
      social ? "La web enlaza perfiles sociales; no se midió actividad ni rendimiento comercial." :
        "No se observaron perfiles sociales en las páginas consultadas; no prueba que no existan.",
      successful[0].url, "low");
    const directContact = successful.find(p => p.text.toLowerCase().includes("mailto:") ||
      p.text.toLowerCase().includes("tel:"));
    push("direct_contact_link", "Canal de contacto anunciado", directContact ? "observed" : "unknown",
      directContact ? "El HTML incluye un enlace para correo o llamada. No se evaluó la respuesta comercial." :
      "El HTML consultado no permite verificar un canal directo de contacto.",
      directContact?.url ?? successful[0].url, directContact ? "medium" : "low");

    if (successful.length < MAX_RESEARCH_PAGES)
      warnings.push("Cobertura limitada: se consultaron " + successful.length + " páginas HTML.");
  }
  const suggestedNeeds: ResearchReport["suggested_needs"] = [];
  if (identity && successful.length) {
    // Two directly observable technical omissions on a linked official website
    // can justify a small, tentative optimization opportunity. One missing
    // tag alone is not sufficient; no hidden sales/marketing tools are inferred.
    const absent = signals.filter(x =>
      ["seo_title", "seo_meta_description", "mobile_viewport"].includes(x.code) &&
      x.outcome === "not_observed");
    const twoPagesChecked = successful.length >= 2;
    const improvement = twoPagesChecked && absent.length >= 2;
    suggestedNeeds.push({
      service: "website",
      state: improvement ? "opportunity_to_improve" : "verified_present",
      method: "website_review",
      evidence_url: successful[0].url,
      confidence: "medium",
      note: improvement
        ? "Auditoría automática " + checkedAt.slice(0, 10) +
          ": sitio oficial confirmado y dos o más señales técnicas verificadas ("
          + absent.map(x => x.label).join(", ") +
          "). Oportunidad acotada de optimización web; no demuestra intención de compra ni necesidad de rediseño."
        : "Web oficial accesible por HTTPS y nombre comercial concordante en título/encabezado; " +
          "verificación automática " + checkedAt.slice(0, 10) + ". No implica ausencia de otras necesidades.",
    });
  }
  const partial = successful.length < 2 || input.some(p => p.status !== 200) || warnings.length > 0;
  return {
    status: successful.length ? partial ? "limited" : "complete" : "limited",
    website: homepage,
    researched_at: checkedAt,
    pages,
    signals,
    warnings: [...new Set(warnings)].slice(0, 12),
    confidence: identity && successful.length >= 2 ? "medium" : successful.length ? "low" : "none",
    identity_matched: identity,
    unverified: UNKNOWN_BY_PUBLIC_WEB,
    suggested_needs: suggestedNeeds,
  };
}

export async function investigateOfficialWebsite(website: string, company: string): Promise<ResearchReport> {
  const url = websiteUrl(website);
  if (!url) throw new ResearchBlocked("invalid_url", "Indica una web pública válida; solo se permite HTTPS y dominios de Internet.");
  const now = new Date().toISOString();
  const robots = await checkRobots(url);
  if (!robots.allows(url.pathname + url.search)) return {
    status: "blocked", website: url.href, researched_at: now, pages: [], signals: [],
    warnings: ["El sitio no permite rastrear esta página según robots.txt."],
    confidence: "none", identity_matched: false, unverified: UNKNOWN_BY_PUBLIC_WEB, suggested_needs: [],
  };
  const warnings: string[] = [];
  const pages: FetchedPage[] = [];
  try { pages.push(await fetchPublicPage(url, "html")); }
  catch (cause) {
    if (cause instanceof ResearchBlocked) warnings.push(cause.message);
    else warnings.push("El sitio no respondió a la consulta segura. No se inferirá que esté ausente.");
    return analyzeWebsitePages(company, [{ url: url.href, status: 0, contentType: "", text: "", complete: false }], now, warnings);
  }
  if (pages[0].status !== 200) return analyzeWebsitePages(company, pages, now,
    ["La página respondió HTTP " + pages[0].status + "; no implica que el negocio no tenga sitio web."]);
  // Only follow 2 explicitly linked, same-host, robots-allowed pages. No automatic crawl of a whole site.
  for (const target of chooseResearchPages(pages[0].text, url)) {
    const u = new URL(target);
    if (!robots.allows(u.pathname + u.search)) {
      warnings.push("Se omitió una sección por robots.txt.");
      continue;
    }
    try { pages.push(await fetchPublicPage(u, "html")); }
    catch { warnings.push("Una sección interna no pudo verificarse; sin conclusiones negativas."); }
  }
  return analyzeWebsitePages(company, pages, now, warnings);
}
