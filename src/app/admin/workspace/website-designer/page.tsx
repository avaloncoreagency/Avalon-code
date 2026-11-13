import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";

export const dynamic = "force-dynamic";

export default async function WebsiteDesignerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const projects = await listProjects(supabase, "website", { includeArchived: showArchived });
  return (
    <Suite active="website-designer">
      <PageHeader eyebrow="Website Designer" title={pick(lang, "Mis Websites", "My Websites")}
        description={pick(lang, "Registra websites creados con Claude, Codex u otras herramientas. Abre su URL, conserva versiones y anota errores sin generar websites aquí.", "Register websites built with Claude, Codex or other tools. Open their URL, save versions and track issues without generating websites here.")} />
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="website" base="/admin/workspace/website-designer" projects={projects} noun={{ es: "proyectos web", en: "web projects" }} showArchived={showArchived} />
    </Suite>
  );
}
