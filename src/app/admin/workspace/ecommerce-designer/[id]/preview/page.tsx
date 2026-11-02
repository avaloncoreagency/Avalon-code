import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, DbNotice, Empty } from "@/components/os/ui";
import type { ProductRow } from "@/components/os/product-fields";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { CURRENCIES, formatMoney, isUuid, oneOf } from "@/lib/os/domain";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/ecommerce-designer";

export default async function CatalogPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "ecommerce", id);
  if (!project.error && !project.data) notFound();
  const products = project.data ? await run<ProductRow[]>(supabase.from("os_store_products").select("id,name,sku,category,description,price_cents,inventory,image_url,status,updated_at,version").eq("project_id", id).eq("status", "active").order("category").order("name").limit(120)) : null;
  const currencyResult = oneOf(project.data?.settings?.currency, CURRENCIES);
  const currency = currencyResult.ok ? currencyResult.value : "USD";
  const rows = products?.data ?? [];
  const error = project.error ?? products?.error ?? null;
  return (
    <Suite active="ecommerce-designer">
      <PageHeader eyebrow={pick(lang, "Vista previa", "Preview")} title={project.data?.name ?? "—"}
        description={pick(lang, "Solo productos activos. Vista privada: no modifica ninguna tienda pública ni procesa pagos.", "Active products only. Private view: does not change any public store or process payments.")}
        crumbs={[{ href: BASE, label: "E-commerce Designer" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "…" }]} />
      {error ? <DbNotice lang={lang} error={error} /> : rows.length === 0 ? (
        <Empty title={pick(lang, "No hay productos activos", "No active products")} body={pick(lang, "Marca productos como Activos para verlos aquí.", "Mark products as Active to see them here.")} />
      ) : (
        <div className={s.preview}>
          <div className={s.previewBar}><span /><span /><span />{project.data?.name}</div>
          <div className={s.catalog}>
            {rows.map(p => (
              <article key={p.id} className={s.product}>
                {p.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.image_url} alt={p.name} className={s.productImg} loading="lazy" referrerPolicy="no-referrer" />
                  : <div className={s.productImg} aria-hidden="true" />}
                <div className={s.productBody}>
                  <h3>{p.name}</h3>
                  {p.category && <p>{p.category}</p>}
                  <span className={s.price}>{formatMoney(p.price_cents, currency, lang)}</span>
                  {p.inventory === 0 && <p>{pick(lang, "Agotado", "Out of stock")}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </Suite>
  );
}
