import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Panel, Empty, Badge, DbNotice, param, statusLabel, statusTone, type SearchParams } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run, type DbErrorCode } from "@/lib/os/data";
import { searchTerm, type ModuleKey } from "@/lib/os/domain";

export const dynamic = "force-dynamic";

const BASE: Record<ModuleKey, string> = {
  website: "/admin/workspace/website-designer",
  ecommerce: "/admin/workspace/ecommerce-designer",
  crm_creator: "/admin/workspace/crm-creator",
  receptionist: "/admin/workspace/ai-receptionist",
  marketing: "/admin/workspace/marketing-hub",
  chatbots: "/admin/workspace/ai-chatbots",
};
const MODULE_NAME: Record<ModuleKey, string> = {
  website: "Website Designer", ecommerce: "E-commerce Designer", crm_creator: "CRM Creator", receptionist: "AI Receptionist", marketing: "Marketing Hub", chatbots: "AI Chatbots",
};
const LIMIT = 15;

type Hit = { key: string; href: string; title: string; detail: string; module?: ModuleKey; status?: string; updated: string };

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const raw = (param(query, "q") ?? "").slice(0, 120);
  const term = searchTerm(raw);
  const safeTerm = term.replace(/[%_,()*\\\\"]/g, " ").trim();
  const like = `%${safeTerm}%`;

  let hits: Hit[] = [];
  let error: DbErrorCode | null = null;
  if (term) {
    const [projects, pages, products, items, entries, clients] = await Promise.all([
      run<{ id: string; module: ModuleKey; name: string; description: string; status: string; updated_at: string }[]>(
        supabase.from("os_projects").select("id,module,name,description,status,updated_at").or(`name.ilike.${like},description.ilike.${like}`).order("updated_at", { ascending: false }).limit(LIMIT)),
      run<{ id: string; project_id: string; title: string; slug: string; status: string; updated_at: string }[]>(
        supabase.from("os_website_pages").select("id,project_id,title,slug,status,updated_at").or(`title.ilike.${like},slug.ilike.${like},seo_description.ilike.${like}`).order("updated_at", { ascending: false }).limit(LIMIT)),
      run<{ id: string; project_id: string; name: string; sku: string; category: string; status: string; updated_at: string }[]>(
        supabase.from("os_store_products").select("id,project_id,name,sku,category,status,updated_at").or(`name.ilike.${like},sku.ilike.${like},category.ilike.${like},description.ilike.${like}`).order("updated_at", { ascending: false }).limit(LIMIT)),
      run<{ id: string; project_id: string; title: string; channel: string; status: string; planned_for: string | null; updated_at: string }[]>(
        supabase.from("os_marketing_items").select("id,project_id,title,channel,status,planned_for,updated_at").or(`title.ilike.${like},body.ilike.${like},notes.ilike.${like}`).order("updated_at", { ascending: false }).limit(LIMIT)),
      run<{ id: string; project_id: string; kind: string; question: string; updated_at: string }[]>(
        supabase.from("os_receptionist_entries").select("id,project_id,kind,question,updated_at").or(`question.ilike.${like},answer.ilike.${like}`).order("updated_at", { ascending: false }).limit(LIMIT)),
      run<{ id: string; client_code: string; legal_name: string; trade_name: string; industry: string; status: string; updated_at: string }[]>(
        supabase.from("crm_clients").select("id,client_code,legal_name,trade_name,industry,status,updated_at")
          .or(`legal_name.ilike.${like},trade_name.ilike.${like},client_code.ilike.${like}`)
          .order("updated_at", { ascending: false }).limit(LIMIT)),
    ]);
    error = projects.error ?? pages.error ?? products.error ?? items.error ?? entries.error ?? clients.error ?? null;
    if (!error) {
      hits = [
        ...(clients.data ?? []).map(c => ({ key: `client-${c.id}`, href: `/admin/workspace/crm/clients/${c.id}`, title: c.legal_name, detail: [pick(lang, "Cliente 360°", "Client 360°"), c.client_code, c.trade_name, c.industry].filter(Boolean).join(" · "), status: c.status, updated: c.updated_at })),
        ...(projects.data ?? []).map(p => ({ key: `p-${p.id}`, href: `${BASE[p.module]}/${p.id}`, title: p.name, detail: pick(lang, "Proyecto", "Project") + (p.description ? ` · ${p.description.slice(0, 90)}` : ""), module: p.module, status: p.status, updated: p.updated_at })),
        ...(pages.data ?? []).map(p => ({ key: `w-${p.id}`, href: `${BASE.website}/${p.project_id}/pages/${p.id}`, title: p.title, detail: `${pick(lang, "Página", "Page")} · /${p.slug}`, module: "website" as const, status: p.status, updated: p.updated_at })),
        ...(products.data ?? []).map(p => ({ key: `s-${p.id}`, href: `${BASE.ecommerce}/${p.project_id}/products/${p.id}`, title: p.name, detail: [pick(lang, "Producto", "Product"), p.sku, p.category].filter(Boolean).join(" · "), module: "ecommerce" as const, status: p.status, updated: p.updated_at })),
        ...(items.data ?? []).map(i => ({ key: `m-${i.id}`, href: `${BASE.marketing}/${i.project_id}/items/${i.id}`, title: i.title, detail: [pick(lang, "Contenido", "Content"), i.channel, i.planned_for ? formatDate(lang, i.planned_for) : ""].filter(Boolean).join(" · "), module: "marketing" as const, status: i.status, updated: i.updated_at })),
        ...(entries.data ?? []).map(e => ({ key: `r-${e.id}`, href: `${BASE.receptionist}/${e.project_id}#entry-${e.id}`, title: e.question, detail: e.kind === "faq" ? "FAQ" : pick(lang, "Conocimiento", "Knowledge"), module: "receptionist" as const, updated: e.updated_at })),
      ].sort((a, b) => b.updated.localeCompare(a.updated));
    }
  }

  return (
    <Suite active="search">
      <PageHeader eyebrow={pick(lang, "Búsqueda global", "Global search")} title={term ? pick(lang, `Resultados para “${term}”`, `Results for “${term}”`) : pick(lang, "Buscar en Avalon OS", "Search Avalon OS")}
        description={pick(lang, "Clientes 360°, proyectos, páginas web, productos, marketing y base de conocimiento de la recepcionista.", "Clients 360°, projects, web pages, products, marketing and receptionist knowledge.")} />
      <Panel>
        <form className={s.actions} role="search" action="/admin/search">
          <label className="sr-only" htmlFor="search-q">{pick(lang, "Término de búsqueda", "Search term")}</label>
          <input id="search-q" className={s.input} name="q" type="search" defaultValue={raw} maxLength={80} autoFocus={!term}
            placeholder={pick(lang, "Nombre, SKU, título, pregunta…", "Name, SKU, title, question…")} style={{ flex: 1, minWidth: 180 }} />
          <button className={s.btnPrimary} type="submit">{pick(lang, "Buscar", "Search")}</button>
        </form>
        {raw && !term && <p className={s.meta} role="status">{pick(lang, "Escribe al menos 2 caracteres.", "Type at least 2 characters.")}</p>}
      </Panel>
      {error ? <DbNotice lang={lang} error={error} /> : term && (
        <Panel title={pick(lang, `${hits.length} resultado(s)`, `${hits.length} result(s)`)} id="results">
          {hits.length === 0 ? <Empty title={pick(lang, "Sin resultados", "No results")} body={pick(lang, "Prueba con otra palabra o revisa la ortografía.", "Try another word or check the spelling.")} /> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>{pick(lang, "Resultado", "Result")}</th><th>{pick(lang, "Módulo", "Module")}</th><th>{pick(lang, "Estado", "Status")}</th><th>{pick(lang, "Actualizado", "Updated")}</th></tr></thead>
                <tbody>
                  {hits.map(h => (
                    <tr key={h.key}>
                      <td><Link href={h.href}><strong>{h.title}</strong></Link><div className={s.meta}>{h.detail}</div></td>
                      <td>{h.module ? MODULE_NAME[h.module] : pick(lang, "Clientes / CRM", "Clients / CRM")}</td>
                      <td>{h.status ? <Badge tone={statusTone(h.status)}>{statusLabel(lang, h.status)}</Badge> : "—"}</td>
                      <td className={s.meta}>{formatDate(lang, h.updated, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </Suite>
  );
}
