import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, DbNotice, param, type SearchParams } from "@/components/os/ui";
import { ProductFields, type ProductRow } from "@/components/os/product-fields";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { CURRENCIES, isUuid, oneOf } from "@/lib/os/domain";
import { deleteProduct, updateProduct } from "../../../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/ecommerce-designer";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string; productId: string }>; searchParams: SearchParams }) {
  const { id, productId } = await params;
  if (!isUuid(id) || !isUuid(productId)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "ecommerce", id);
  const product = project.data ? await run<ProductRow | null>(supabase.from("os_store_products").select("id,name,sku,category,description,price_cents,inventory,image_url,status,updated_at,version").eq("id", productId).eq("project_id", id).maybeSingle()) : null;
  if ((!project.error && !project.data) || (product && !product.error && !product.data)) notFound();
  const currencyResult = oneOf(project.data?.settings?.currency, CURRENCIES);
  const currency = currencyResult.ok ? currencyResult.value : "USD";
  const row = product?.data ?? null;
  const error = project.error ?? product?.error ?? null;
  return (
    <Suite active="ecommerce-designer">
      <PageHeader eyebrow="E-commerce Designer" title={row?.name ?? "—"}
        crumbs={[{ href: BASE, label: "E-commerce Designer" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "…" }]} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {error ? <DbNotice lang={lang} error={error} /> : row && (
        <div className={s.split}>
          <Panel title={pick(lang, "Editar producto", "Edit product")} id="edit-product">
            <form action={updateProduct} className={s.form}>
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="productId" value={row.id} />
              <input type="hidden" name="version" value={row.version} />
              <ProductFields lang={lang} currency={currency} product={row} />
              <div className={s.actions}>
                <button className={s.btnPrimary} type="submit">{pick(lang, "Guardar", "Save")}</button>
                <span className={s.meta}>v{row.version} · {formatDate(lang, row.updated_at, true)}</span>
              </div>
            </form>
          </Panel>
          <div>
            <Panel title={pick(lang, "Imagen", "Image")} id="image">
              {row.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={row.image_url} alt={row.name} className={s.productImg} style={{ borderRadius: 12 }} loading="lazy" referrerPolicy="no-referrer" />
                : <p className={s.meta}>{pick(lang, "Sin imagen. Pega una URL https para mostrarla.", "No image. Paste an https URL to show one.")}</p>}
            </Panel>
            <details className={s.details}>
              <summary>{pick(lang, "Eliminar producto", "Delete product")}</summary>
              <form action={deleteProduct} className={s.form}>
                <input type="hidden" name="projectId" value={id} />
                <input type="hidden" name="productId" value={row.id} />
                <label className={s.check}><input type="checkbox" name="confirm" value="yes" required />{pick(lang, "Confirmo la eliminación. Alternativa: archivarlo.", "I confirm deletion. Alternative: archive it.")}</label>
                <div className={s.actions}><button className={s.btnDanger} type="submit">{pick(lang, "Eliminar", "Delete")}</button></div>
              </form>
            </details>
          </div>
        </div>
      )}
    </Suite>
  );
}
