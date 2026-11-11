import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, Empty, Badge, DbNotice, param, statusLabel, statusTone, type SearchParams } from "@/components/os/ui";
import { ProjectSettingsForm } from "@/components/os/projects";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { getProject, run } from "@/lib/os/data";
import { isUuid } from "@/lib/os/domain";
import { createPage } from "../actions";
import { saveWebsiteToLibrary } from "../library-actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/website-designer";

export default async function WebsiteProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "website", id);
  if (!project.error && !project.data) notFound();
  const pages = project.data
    ? await run<{ id: string; title: string; slug: string; status: string; updated_at: string; version: number }[]>(
      supabase.from("os_website_pages").select("id,title,slug,status,updated_at,version").eq("project_id", id).order("position").order("created_at").limit(200))
    : null;

  const pageRows = pages?.data ?? [];
  return (
    <Suite active="website-designer">
      <PageHeader eyebrow="Website Designer" title={project.data?.name ?? "—"} description={project.data?.description || undefined}
        crumbs={[{ href: BASE, label: "Website Designer" }]}
        actions={project.data ? <div className={s.actions}>
          <Link className={s.btnPrimary} href={`${BASE}/${id}/studio`} data-testid="open-studio">{pick(lang, "Abrir editor visual (Nova)", "Open visual editor (Nova)")}</Link>
          <form action={saveWebsiteToLibrary}><input type="hidden" name="projectId" value={id} /><button className={s.btn} type="submit" data-testid="save-to-library">{pick(lang, "Guardar versión en Biblioteca", "Save version to Library")}</button></form>
          <Link className={s.btnGhost} href={`/admin/workspace/library/${id}`} data-testid="open-library">{pick(lang, "Versiones y publicación", "Versions & publishing")}</Link>
        </div> : undefined} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : project.data && (
        <div className={s.split}>
          <div>
            <Panel title={pick(lang, "Páginas", "Pages")} id="pages-title">
              {pages?.error ? <DbNotice lang={lang} error={pages.error} /> : pageRows.length === 0 ? (
                <Empty title={pick(lang, "Sin páginas", "No pages")} body={pick(lang, "Añade la primera página (por ejemplo, Inicio).", "Add the first page (for example, Home).")} />
              ) : (
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead><tr><th>{pick(lang, "Página", "Page")}</th><th>{pick(lang, "Ruta", "Path")}</th><th>{pick(lang, "Estado", "Status")}</th><th>{pick(lang, "Actualizada", "Updated")}</th><th><span className="sr-only">{pick(lang, "Acciones", "Actions")}</span></th></tr></thead>
                    <tbody>
                      {pageRows.map(p => (
                        <tr key={p.id}>
                          <td><Link href={`${BASE}/${id}/pages/${p.id}`}>{p.title}</Link></td>
                          <td className={s.meta}>/{p.slug === "inicio" || p.slug === "home" ? "" : p.slug}</td>
                          <td><Badge tone={statusTone(p.status)}>{statusLabel(lang, p.status)}</Badge></td>
                          <td className={s.meta}>{formatDate(lang, p.updated_at)}</td>
                          <td><div className={s.actions}><Link className={`${s.btn} ${s.small}`} href={`${BASE}/${id}/pages/${p.id}`}>{pick(lang, "Editar", "Edit")}</Link><Link className={`${s.btnGhost} ${s.small}`} href={`${BASE}/${id}/pages/${p.id}/preview`}>{pick(lang, "Vista previa", "Preview")}</Link></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
          <div>
            <Panel title={pick(lang, "Nueva página", "New page")} id="new-page">
              <form action={createPage} className={s.form}>
                <input type="hidden" name="projectId" value={id} />
                <label className={s.field}><span>{pick(lang, "Título", "Title")} *</span><input className={s.input} name="title" required maxLength={160} /></label>
                <label className={s.field}><span>{pick(lang, "Ruta (opcional)", "Path (optional)")}</span><input className={s.input} name="slug" maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="servicios" /><small>{pick(lang, "Minúsculas, números y guiones. Se genera desde el título si se deja vacío.", "Lowercase, numbers and hyphens. Generated from the title if empty.")}</small></label>
                <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang, "Crear página", "Create page")}</button></div>
              </form>
            </Panel>
            <Panel title={pick(lang, "Configuración del proyecto", "Project settings")} id="project-settings">
              <ProjectSettingsForm lang={lang} project={project.data} />
            </Panel>
          </div>
        </div>
      )}
    </Suite>
  );
}
