import data from "./library.generated.json";

/**
 * Avalon document library (AVL-ALPHA-FINAL-001 · A03/A05/A12). Single registry of the department content packs:
 *   - sales  (AVL-SALES-TEAM-001, #352): Employee Welcome Package, playbooks, scripts, 7-day training → audience staff.
 *   - client (AVL-OPS-CLIENT-001, #353): welcome package, onboarding per service, manuals, e-mail bodies, delivery
 *     protocol → audience client.
 * Content is copied verbatim from the repository by scripts/docs/build-library.cjs with its sha256.
 *
 * DISTRIBUTION RULE: only documents whose manifest says APPROVED (set by Miguel/Samuel through a reviewed PR) may
 * leave the owners' area — to a seller in the Agent Portal or to a client. Everything else is visible to owners
 * only, labelled as pending review. Nothing here grants commercial authority, legal effect or access by itself.
 */
export type DocAudience = "staff" | "client";
export type LibraryDoc = {
  id: string; pack: "sales" | "client"; audience: DocAudience; category: string; service: string; version: string;
  languages: ("es" | "en")[]; approval: "approved" | "pending"; approvalLabel: string; source: string; title: string; sha256: string; content: string;
};
export const LIBRARY = data as unknown as { schema: string; packs: Record<string, { manifest: string; version: string; state: string }>; documents: LibraryDoc[] };
export const ALL_DOCUMENTS: readonly LibraryDoc[] = LIBRARY.documents;

export const documentById = (id: string) => ALL_DOCUMENTS.find(d => d.id === id) ?? null;
export const isDistributable = (d: LibraryDoc) => d.approval === "approved";

/**
 * Interface for OMEGA (Agent Portal / Staff): documents a seller may open. Codex mounts this inside Staff; the
 * caller is responsible for authorising the session (active staff access). Only APPROVED staff documents.
 */
export function staffDocuments(lang?: "es" | "en"): LibraryDoc[] {
  return ALL_DOCUMENTS.filter(d => d.audience === "staff" && isDistributable(d) && (!lang || d.languages.includes(lang)));
}

/** Client welcome / onboarding documents for a contracted service: only APPROVED, only that service or "all". */
export function clientDocuments(service: string, lang?: "es" | "en"): LibraryDoc[] {
  return ALL_DOCUMENTS.filter(d => d.audience === "client" && isDistributable(d) && (d.service === "all" || d.service === service)
    && (!lang || d.languages.includes(lang)));
}

/** Owner view: everything, approved or not, grouped by pack (never exposed to sellers or clients). */
export function ownerCatalog() {
  return { sales: ALL_DOCUMENTS.filter(d => d.pack === "sales"), client: ALL_DOCUMENTS.filter(d => d.pack === "client") };
}

export const APPROVAL_LABEL: Record<LibraryDoc["approval"], [string, string]> = {
  approved: ["Aprobado por los propietarios", "Approved by the owners"],
  pending: ["Pendiente de revisión (no se distribuye)", "Pending review (not distributed)"],
};

/** Owner library filters (G03): free text over id/title/content, audience, service and approval state. Pure. */
export type LibraryFilter = { q?: string; audience?: string; service?: string; approval?: string };
export function filterLibrary(docs: readonly LibraryDoc[], f: LibraryFilter): LibraryDoc[] {
  const q = (f.q ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().slice(0, 80);
  const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return docs.filter(d => (!f.audience || f.audience === "all" || d.audience === f.audience)
    && (!f.approval || f.approval === "all" || d.approval === f.approval)
    && (!f.service || f.service === "all" || d.service === f.service || d.service === "all")
    && (!q || fold(`${d.id} ${d.title} ${d.content}`).includes(q)));
}

/** Review pack for Miguel and Samuel (G03): one internal document with the approval matrix and every document's text. */
export function reviewPackMarkdown(docs: readonly LibraryDoc[]): string {
  const approved = docs.filter(isDistributable).length;
  const out = ["# Paquete de revisión de la biblioteca · Library review pack", "",
    `Documentos: ${docs.length} · aprobados: ${approved} · pendientes: ${docs.length - approved}. La aprobación se registra en el manifiesto de cada paquete mediante un PR revisado por los propietarios; este paquete no aprueba nada por sí mismo.`, "",
    "## Matriz de aprobación · Approval matrix", "",
    "| ID | Título | Versión | Idiomas | Audiencia | Servicio | Estado actual | sha256 |", "|---|---|---|---|---|---|---|---|",
    ...docs.map(d => `| ${d.id} | ${d.title.replace(/\|/g, "/")} | v${d.version} | ${d.languages.join("/").toUpperCase()} | ${d.audience === "staff" ? "Empleados" : "Clientes"} | ${d.service} | ${d.approvalLabel.replace(/_/g, " ")} | ${d.sha256.slice(0, 12)} |`), "",
    "## Decisión de los propietarios · Owners' decision", "",
    ...docs.map(d => `- ${d.id}: [ ] Aprobar (Miguel) [ ] Aprobar (Samuel) [ ] Cambios solicitados — notas: ________`), ""];
  for (const d of docs) out.push("---", `# ${d.id} · ${d.title}`, `Fuente: ${d.source} · v${d.version} · sha256 ${d.sha256.slice(0, 16)}`, "", d.content, "");
  return out.join("\n");
}
