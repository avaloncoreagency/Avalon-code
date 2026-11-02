import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, Empty, Badge, DbNotice, param, statusLabel, statusTone, type SearchParams } from "@/components/os/ui";
import { ProjectSettingsForm } from "@/components/os/projects";
import { ProductFields, type ProductRow } from "@/components/os/product-fields";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { getProject, run, type Loaded } from "@/lib/os/data";
import { CURRENCIES, formatMoney, isUuid, oneOf } from "@/lib/os/domain";
import { createProduct, updateStoreSettings } from "../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/ecommerce-designer";
const PAGE_SIZE = 25;

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "ecommerce", id);
  if (!project.error && !project.data) notFound();
  const currencyResult = oneOf(project.data?.settings?.currency, CURRENCIES);
  const currency = currencyResult.ok ? currencyResult.value : "USD";
  const page = Math.max(1, Math.min(1000, Number(param(query, "page")) || 1));
  const search = (param(query, "q") ?? "").trim().slice(0, 80);
  const statusFilter = oneOf(param(query, "status"), ["draft", "active", "archived"] as const);

  let products: Loaded<ProductRow[]> | null = null;
  if (project.data) {
    let q = supabase.from("os_store_products").select("id,name,sku,category,description,price_cents,inventory,image_url,status,updated_at,version", { count: "exact" })
      .eq("project_id", id).order("name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (search) q = q.or(`name.ilike.%${search.replace(/[%_,().*\\]/g, " ")}%,sku.ilike.%${search.replace(/[%_,().*\\]/g, " ")}%`);
    if (statusFilter.ok) q = q.eq("status", statusFilter.value);
    products = await run<ProductRow[]>(q);
  }
  const rows = products?.data ?? [];
  const total = products?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `${BASE}/${id}?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(statusFilter.ok ? { status: statusFilter.value } : {}), page: String(p) })}`;

  return (
    <Suite active="ecommerce-designer">
      <PageHeader eyebrow="E-commerce Designer" title={project.data?.name ?? "—"} description={project.data?.description || undefined}
        crumbs={[{ href: BASE, label: "E-commerce Designer" }]}
        actions={project.data && <>
          <Link className={s.btn} href={`${BASE}/${id}/preview`}>{pick(lang, "Vista previa del catálogo", "Catalog preview")}</Link>
          <a className={s.btn} href={`${BASE}/${id}/export`} download>{pick(lang, "Exportar CSV", "Export CSV")}</a>
        </>} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : project.data && (
        <div className={s.split}>
          <div>
            <Panel title={pick(lang, `Productos (${total})`, `Products (${total})`)} id="products-title">
              <form className={s.actions} style={{ marginBottom: 12 }} role="search">
                <label className="sr-only" htmlFor="q">{pick(lang, "Buscar", "Search")}</label>
                <input id="q" className={s.input} name="q" defaultValue={search} placeholder={pick(lang, "Buscar por nombre o SKU", "Search by name or SKU")} style={{ flex: 1, minWidth: 160 }} />
                <label className="sr-only" htmlFor="status">{pick(lang, "Estado", "Status")}</label>
                <select id="status" className={s.select} name="status" defaultValue={statusFilter.ok ? statusFilter.value : ""} style={{ width: "auto" }}>
                  <option value="">{pick(lang, "Todos", "All")}</option>
                  {(["draft", "active", "archived"] as const).map(v => <option key={v} value={v}>{statusLabel(lang, v)}</option>)}
                </select>
                <button className={s.btn} type="submit">{pick(lang, "Filtrar", "Filter")}</button>
              </form>
              {products?.error ? <DbNotice lang={lang} error={products.error} /> : rows.length === 0 ? (
                <Empty title={search || statusFilter.ok ? pick(lang, "Sin resultados", "No results") : pick(lang, "Catálogo vacío", "Empty catalog")} body={pick(lang, "Añade productos con el formulario.", "Add products with the form.")} />
              ) : (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead><tr><th>{pick(lang, "Producto", "Product")}</th><th>{pick(lang, "Categoría", "Category")}</th><th className={s.num}>{pick(lang, "Precio", "Price")}</th><th className={s.num}>{pick(lang, "Stock", "Stock")}</th><th>{pick(lang, "Estado", "Status")}</th></tr></thead>
                    <tbody>
                      {rows.map(p => (
                        <tr key={p.id}>
                          <td><Link href={`${BASE}/${id}/products/${p.id}`}>{p.name}</Link>{p.sku && <div className={s.meta}>{p.sku}</div>}</td>
                          <td className={s.meta}>{p.category || "—"}</td>
                          <td className={s.num}>{formatMoney(p.price_cents, currency, lang)}</td>
                          <td className={s.num}>{p.inventory === 0 ? <Badge tone="danger">0</Badge> : p.inventory}</td>
                          <td><Badge tone={statusTone(p.status)}>{statusLabel(lang, p.status)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pages > 1 && (
                <nav className={s.actions} style={{ marginTop: 12 }} aria-label={pick(lang, "Paginación", "Pagination")}>
                  {page > 1 && <Link className={`${s.btn} ${s.small}`} href={link(page - 1)}>← {pick(lang, "Anterior", "Previous")}</Link>}
                  <span className={s.meta}>{page} / {pages}</span>
                  {page < pages && <Link className={`${s.btn} ${s.small}`} href={link(page + 1)}>{pick(lang, "Siguiente", "Next")} →</Link>}
                </nav>
              )}
            </Panel>
          </div>
          <div>
            <Panel title={pick(lang, "Nuevo producto", "New product")} id="new-product">
              <form action={createProduct} className={s.form}>
                <input type="hidden" name="projectId" value={id} />
                <ProductFields lang={lang} currency={currency} />
                <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang, "Añadir producto", "Add product")}</button></div>
              </form>
            </Panel>
            <Panel title={pick(lang, "Configuración de tienda", "Store settings")} id="store-settings">
              <form action={updateStoreSettings} className={s.form} style={{ marginBottom: 18 }}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="version" value={project.data.version} />
                <label className={s.field}><span>{pick(lang, "Moneda", "Currency")}</span>
                  <select className={s.select} name="currency" defaultValue={currency}>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                  <small>{pick(lang, "Los precios se guardan en unidades menores; cambiar la moneda no convierte importes.", "Prices are stored in minor units; changing currency does not convert amounts.")}</small>
                </label>
                <div className={s.actions}><button className={s.btn} type="submit">{pick(lang, "Guardar moneda", "Save currency")}</button></div>
              </form>
              <ProjectSettingsForm lang={lang} project={project.data} />
            </Panel>
            <Panel title={pick(lang, "Pedidos y pagos", "Orders and payments")} id="orders">
              <p className={s.meta}>{pick(lang, "No hay procesador de pagos conectado. Los pedidos se habilitarán tras aprobar una integración (p. ej., Stripe) y su coste.", "No payment processor is connected. Orders will be enabled after an integration (e.g. Stripe) and its cost are approved.")}</p>
            </Panel>
          </div>
        </div>
      )}
    </Suite>
  );
}
