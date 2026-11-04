import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, param, type SearchParams } from "@/components/os/ui";
import { ProjectsIndex } from "@/components/os/projects";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { listProjects } from "@/lib/os/data";

export const dynamic = "force-dynamic";

export default async function MarketingHubPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const showArchived = param(params, "archived") === "1";
  const projects = await listProjects(supabase, "marketing", { includeArchived: showArchived });
  return (
    <Suite active="marketing-hub">
      <PageHeader eyebrow="Marketing Hub" title={pick(lang, "Campañas", "Campaigns")}
        description={pick(lang, "Planifica campañas, calendario editorial, borradores, activos creativos y tareas por canal. Nada se publica en cuentas externas ni se gasta presupuesto publicitario.", "Plan campaigns, editorial calendar, drafts, creative assets and tasks per channel. Nothing is posted to external accounts and no ad budget is spent.")} />
      <section aria-label={pick(lang, "Herramientas creativas", "Creative tools")}
        style={{ margin: "12px 24px", border: "1px solid #4b607f", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>Avalon Creative Bridge · Higgsfield</h2>
        <p>{pick(lang,
          "Revisa proyectos y recursos visuales aprobados, sus entregas verificables y su vínculo con el CRM. No se generan contenidos ni se consumen créditos desde esta pantalla.",
          "Review approved visual assets and projects, verifiable handoffs and CRM links. This page does not generate content or spend credits.")}</p>
        <Link href="/admin/creative-bridge">
          {pick(lang, "Abrir puente Higgsfield → Avalon", "Open Higgsfield → Avalon bridge")}
        </Link>
      </section>
      <Flash lang={lang} ok={param(params, "ok")} error={param(params, "error")} />
      <ProjectsIndex lang={lang} module="marketing" base="/admin/workspace/marketing-hub" projects={projects} noun={{ es: "campañas", en: "campaigns" }} showArchived={showArchived}
        createFields={<label className={s.field}><span>{pick(lang, "Objetivo", "Goal")}</span><input className={s.input} name="goal" maxLength={500} /></label>} />
    </Suite>
  );
}
