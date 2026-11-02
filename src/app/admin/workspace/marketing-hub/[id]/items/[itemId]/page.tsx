import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, DbNotice, param, type SearchParams } from "@/components/os/ui";
import { MarketingFields, type MarketingItem } from "@/components/os/marketing-fields";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";
import { deleteMarketingItem, updateMarketingItem } from "../../../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/marketing-hub";

export default async function MarketingItemPage({ params, searchParams }: { params: Promise<{ id: string; itemId: string }>; searchParams: SearchParams }) {
  const { id, itemId } = await params;
  if (!isUuid(id) || !isUuid(itemId)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "marketing", id);
  const item = project.data ? await run<MarketingItem | null>(supabase.from("os_marketing_items").select("id,title,channel,status,planned_for,body,asset_url,notes,updated_at,version").eq("id", itemId).eq("project_id", id).maybeSingle()) : null;
  if ((!project.error && !project.data) || (item && !item.error && !item.data)) notFound();
  const row = item?.data ?? null;
  const error = project.error ?? item?.error ?? null;
  return (
    <Suite active="marketing-hub">
      <PageHeader eyebrow="Marketing Hub" title={row?.title ?? "—"} crumbs={[{ href: BASE, label: "Marketing Hub" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "…" }]} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {error ? <DbNotice lang={lang} error={error} /> : row && (
        <div className={s.split}>
          <Panel title={pick(lang, "Editar contenido", "Edit content")} id="edit">
            <form action={updateMarketingItem} className={s.form}>
              <input type="hidden" name="projectId" value={id} /><input type="hidden" name="itemId" value={row.id} /><input type="hidden" name="version" value={row.version} />
              <MarketingFields lang={lang} item={row} />
              <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang, "Guardar", "Save")}</button><span className={s.meta}>v{row.version} · {formatDate(lang, row.updated_at, true)}</span></div>
            </form>
          </Panel>
          <div>
            {row.asset_url && <Panel title={pick(lang, "Activo creativo", "Creative asset")} id="asset"><a href={row.asset_url} target="_blank" rel="noopener noreferrer" className={s.btn}>{pick(lang, "Abrir activo", "Open asset")} ↗</a></Panel>}
            <details className={s.details}>
              <summary>{pick(lang, "Eliminar contenido", "Delete content")}</summary>
              <form action={deleteMarketingItem} className={s.form}>
                <input type="hidden" name="projectId" value={id} /><input type="hidden" name="itemId" value={row.id} />
                <label className={s.check}><input type="checkbox" name="confirm" value="yes" required />{pick(lang, "Confirmo la eliminación. Alternativa: marcarlo como cancelado.", "I confirm deletion. Alternative: mark it cancelled.")}</label>
                <div className={s.actions}><button className={s.btnDanger} type="submit">{pick(lang, "Eliminar", "Delete")}</button></div>
              </form>
            </details>
          </div>
        </div>
      )}
    </Suite>
  );
}
