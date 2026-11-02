import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, Badge, DbNotice, param, statusLabel, statusTone, type SearchParams } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate, type Lang } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { BLOCK_TYPES, isUuid, readBlocks, type Block } from "@/lib/os/domain";
import { addBlock, deleteBlock, deletePage, moveBlock, restoreVersion, saveBlock, setPageStatus, updatePageMeta } from "../../../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/website-designer";
const BLOCK_NAMES: Record<Block["type"], [string, string]> = {
  hero: ["Portada", "Hero"], text: ["Texto", "Text"], features: ["Lista de ventajas", "Features"], cta: ["Llamada a la acción", "Call to action"],
};
type PageRow = { id: string; title: string; slug: string; seo_description: string; blocks: unknown; status: string; published_at: string | null; updated_at: string; version: number };

function Hidden({ projectId, pageId, version }: { projectId: string; pageId: string; version: number }) {
  return <><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="pageId" value={pageId} /><input type="hidden" name="version" value={version} /></>;
}

function BlockFields({ lang, block }: { lang: Lang; block: Block }) {
  const heading = <label className={s.field}><span>{pick(lang, "Título", "Heading")}</span><input className={s.input} name="heading" defaultValue={block.heading} maxLength={200} /></label>;
  const button = "buttonLabel" in block && (
    <div className={s.row}>
      <label className={s.field}><span>{pick(lang, "Texto del botón", "Button label")}</span><input className={s.input} name="buttonLabel" defaultValue={block.buttonLabel} maxLength={60} /></label>
      <label className={s.field}><span>{pick(lang, "Enlace del botón", "Button link")}</span><input className={s.input} name="buttonHref" defaultValue={block.buttonHref} maxLength={500} placeholder="/contacto · https://… · mailto:…" /></label>
    </div>
  );
  switch (block.type) {
    case "hero": return <>{heading}<label className={s.field}><span>{pick(lang, "Subtítulo", "Subheading")}</span><textarea className={s.textarea} name="subheading" defaultValue={block.subheading} maxLength={500} rows={2} /></label>{button}</>;
    case "text": return <>{heading}<label className={s.field}><span>{pick(lang, "Contenido", "Body")}</span><textarea className={s.textarea} name="body" defaultValue={block.body} maxLength={10000} rows={6} /></label></>;
    case "features": return <>{heading}<label className={s.field}><span>{pick(lang, "Elementos (uno por línea, máx. 24)", "Items (one per line, max 24)")}</span><textarea className={s.textarea} name="items" defaultValue={block.items.join("\n")} rows={5} /></label></>;
    case "cta": return <>{heading}<label className={s.field}><span>{pick(lang, "Texto", "Body")}</span><textarea className={s.textarea} name="body" defaultValue={block.body} maxLength={2000} rows={3} /></label>{button}</>;
  }
}

export default async function PageEditor({ params, searchParams }: { params: Promise<{ id: string; pageId: string }>; searchParams: SearchParams }) {
  const { id, pageId } = await params;
  if (!isUuid(id) || !isUuid(pageId)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "website", id);
  const page = project.data
    ? await run<PageRow | null>(supabase.from("os_website_pages").select("id,title,slug,seo_description,blocks,status,published_at,updated_at,version").eq("id", pageId).eq("project_id", id).maybeSingle())
    : null;
  if ((!project.error && !project.data) || (page && !page.error && !page.data)) notFound();
  const versions = page?.data
    ? await run<{ id: string; page_version: number; title: string; created_at: string }[]>(supabase.from("os_website_page_versions").select("id,page_version,title,created_at").eq("page_id", pageId).order("page_version", { ascending: false }).limit(20))
    : null;
  const row = page?.data ?? null;
  const blocks = row ? readBlocks(row.blocks) : [];
  const error = project.error ?? page?.error ?? null;

  return (
    <Suite active="website-designer">
      <PageHeader eyebrow="Website Designer" title={row?.title ?? "—"}
        crumbs={[{ href: BASE, label: "Website Designer" }, { href: `${BASE}/${id}`, label: project.data?.name ?? "…" }]}
        actions={row && <>
          <Link className={s.btn} href={`${BASE}/${id}/pages/${pageId}/preview`}>{pick(lang, "Vista previa", "Preview")}</Link>
          <a className={s.btn} href={`${BASE}/${id}/pages/${pageId}/export`} download>{pick(lang, "Descargar HTML", "Download HTML")}</a>
          <form action={setPageStatus} className={s.inline}>
            <Hidden projectId={id} pageId={pageId} version={row.version} />
            <input type="hidden" name="status" value={row.status === "published" ? "draft" : "published"} />
            <button className={row.status === "published" ? s.btn : s.btnPrimary} type="submit">{row.status === "published" ? pick(lang, "Volver a borrador", "Unpublish") : pick(lang, "Publicar", "Publish")}</button>
          </form>
        </>} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {error ? <DbNotice lang={lang} error={error} /> : row && (
        <div className={s.split}>
          <div className={s.stack}>
            <p className={s.meta}>
              <Badge tone={statusTone(row.status)}>{statusLabel(lang, row.status)}</Badge>{" "}
              v{row.version} · {pick(lang, "Actualizada", "Updated")} {formatDate(lang, row.updated_at, true)}
              {row.published_at && <> · {pick(lang, "Publicada", "Published")} {formatDate(lang, row.published_at, true)}</>}
            </p>
            {blocks.length === 0 && <p className={s.meta}>{pick(lang, "Esta página no tiene bloques. Añade uno abajo.", "This page has no blocks. Add one below.")}</p>}
            {blocks.map((block, index) => (
              <section key={index} id={`block-${index}`} className={s.block} aria-label={`${pick(lang, ...BLOCK_NAMES[block.type])} ${index + 1}`}>
                <div className={s.blockHead}>
                  <strong>{index + 1}. {pick(lang, ...BLOCK_NAMES[block.type])}</strong>
                  <div className={s.actions}>
                    {(["up", "down"] as const).map(direction => (
                      <form key={direction} action={moveBlock} className={s.inline}>
                        <Hidden projectId={id} pageId={pageId} version={row.version} />
                        <input type="hidden" name="index" value={index} /><input type="hidden" name="direction" value={direction} />
                        <button className={`${s.btnGhost} ${s.small}`} type="submit" disabled={direction === "up" ? index === 0 : index === blocks.length - 1}
                          aria-label={direction === "up" ? pick(lang, "Subir bloque", "Move block up") : pick(lang, "Bajar bloque", "Move block down")}>{direction === "up" ? "↑" : "↓"}</button>
                      </form>
                    ))}
                    <form action={deleteBlock} className={s.inline}>
                      <Hidden projectId={id} pageId={pageId} version={row.version} />
                      <input type="hidden" name="index" value={index} />
                      <button className={`${s.btnDanger} ${s.small}`} type="submit">{pick(lang, "Quitar", "Remove")}</button>
                    </form>
                  </div>
                </div>
                <form action={saveBlock} className={s.form}>
                  <Hidden projectId={id} pageId={pageId} version={row.version} />
                  <input type="hidden" name="index" value={index} />
                  <BlockFields lang={lang} block={block} />
                  <div className={s.actions}><button className={`${s.btnPrimary} ${s.small}`} type="submit">{pick(lang, "Guardar bloque", "Save block")}</button></div>
                </form>
              </section>
            ))}
            <Panel title={pick(lang, "Añadir bloque", "Add block")} id="add-block">
              <form action={addBlock} className={s.actions}>
                <Hidden projectId={id} pageId={pageId} version={row.version} />
                <label className="sr-only" htmlFor="block-type">{pick(lang, "Tipo de bloque", "Block type")}</label>
                <select id="block-type" className={s.select} name="type" style={{ width: "auto" }}>
                  {BLOCK_TYPES.map(t => <option key={t} value={t}>{pick(lang, ...BLOCK_NAMES[t])}</option>)}
                </select>
                <button className={s.btn} type="submit">{pick(lang, "Añadir", "Add")}</button>
              </form>
            </Panel>
          </div>
          <div>
            <Panel title={pick(lang, "Página", "Page")} id="page-meta">
              <form action={updatePageMeta} className={s.form}>
                <Hidden projectId={id} pageId={pageId} version={row.version} />
                <label className={s.field}><span>{pick(lang, "Título", "Title")} *</span><input className={s.input} name="title" defaultValue={row.title} required maxLength={160} /></label>
                <label className={s.field}><span>{pick(lang, "Ruta", "Path")} *</span><input className={s.input} name="slug" defaultValue={row.slug} required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
                <label className={s.field}><span>{pick(lang, "Descripción SEO", "SEO description")}</span><textarea className={s.textarea} name="seo_description" defaultValue={row.seo_description} maxLength={300} rows={3} /></label>
                <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang, "Guardar", "Save")}</button></div>
              </form>
            </Panel>
            <Panel title={pick(lang, "Versiones", "Versions")} id="versions">
              {versions?.error ? <DbNotice lang={lang} error={versions.error} /> : (
                <ul className={s.stack} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {(versions?.data ?? []).map(v => (
                    <li key={v.id} className={s.actions} style={{ justifyContent: "space-between" }}>
                      <span className={s.meta}>v{v.page_version} · {formatDate(lang, v.created_at, true)}</span>
                      {v.page_version === row.version ? <Badge tone="info">{pick(lang, "Actual", "Current")}</Badge> : (
                        <form action={restoreVersion} className={s.inline}>
                          <Hidden projectId={id} pageId={pageId} version={row.version} />
                          <input type="hidden" name="versionId" value={v.id} />
                          <button className={`${s.btn} ${s.small}`} type="submit">{pick(lang, "Restaurar", "Restore")}</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className={s.meta}>{pick(lang, "Se guarda una versión en cada cambio de contenido (últimas 20).", "A version is stored on every content change (latest 20 shown).")}</p>
            </Panel>
            <details className={s.details}>
              <summary>{pick(lang, "Eliminar página", "Delete page")}</summary>
              <form action={deletePage} className={s.form}>
                <Hidden projectId={id} pageId={pageId} version={row.version} />
                <label className={s.check}><input type="checkbox" name="confirm" value="yes" required />{pick(lang, "Confirmo que quiero eliminar esta página y su historial.", "I confirm deleting this page and its history.")}</label>
                <div className={s.actions}><button className={s.btnDanger} type="submit">{pick(lang, "Eliminar", "Delete")}</button></div>
              </form>
            </details>
          </div>
        </div>
      )}
    </Suite>
  );
}
