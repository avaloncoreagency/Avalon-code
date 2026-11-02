import { pick, type Lang } from "@/lib/i18n";
import { centsToInput } from "@/lib/os/domain";
import s from "./os.module.css";

export type ProductRow = { id: string; name: string; sku: string; category: string; description: string; price_cents: number; inventory: number; image_url: string; status: string; updated_at: string; version: number };

export function ProductFields({ lang, currency, product }: { lang: Lang; currency: string; product?: ProductRow }) {
  return (
    <>
      <label className={s.field}><span>{pick(lang, "Nombre", "Name")} *</span><input className={s.input} name="name" defaultValue={product?.name} required maxLength={160} /></label>
      <div className={s.row}>
        <label className={s.field}><span>SKU</span><input className={s.input} name="sku" defaultValue={product?.sku} maxLength={64} pattern="[A-Za-z0-9._\-]*" /></label>
        <label className={s.field}><span>{pick(lang, "Categoría", "Category")}</span><input className={s.input} name="category" defaultValue={product?.category} maxLength={80} /></label>
      </div>
      <div className={s.row}>
        <label className={s.field}><span>{pick(lang, "Precio", "Price")} ({currency})</span><input className={s.input} name="price" inputMode="decimal" defaultValue={product ? centsToInput(product.price_cents, currency) : ""} placeholder="0.00" /></label>
        <label className={s.field}><span>{pick(lang, "Inventario", "Inventory")}</span><input className={s.input} name="inventory" type="number" min={0} max={10000000} step={1} defaultValue={product?.inventory ?? 0} /></label>
        <label className={s.field}><span>{pick(lang, "Estado", "Status")}</span>
          <select className={s.select} name="status" defaultValue={product?.status ?? "draft"}>
            <option value="draft">{pick(lang, "Borrador", "Draft")}</option><option value="active">{pick(lang, "Activo", "Active")}</option><option value="archived">{pick(lang, "Archivado", "Archived")}</option>
          </select>
        </label>
      </div>
      <label className={s.field}><span>{pick(lang, "URL de imagen (https)", "Image URL (https)")}</span><input className={s.input} name="image_url" type="url" defaultValue={product?.image_url} maxLength={1000} placeholder="https://" /></label>
      <label className={s.field}><span>{pick(lang, "Descripción", "Description")}</span><textarea className={s.textarea} name="description" defaultValue={product?.description} maxLength={4000} rows={3} /></label>
    </>
  );
}
