import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { moduleBySlug } from "@/components/suite/modules";
import { PageHeader, Panel, Empty } from "@/components/os/ui";
import s from "@/components/os/os.module.css";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Every module has its own static route. This dynamic fallback only serves the
// CRM entry point until Samuel's CRM branch (PR #6) adds src/app/admin/workspace/crm,
// which takes precedence automatically. No CRM files are created here.
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const item = moduleBySlug(module);
  if (!item || item.slug !== "crm") notFound();
  const lang = await getLang();
  return (
    <Suite active="crm">
      <PageHeader eyebrow="CRM" title="CRM" description={item.description[lang]} />
      <Panel>
        <Empty title={pick(lang, "CRM en desarrollo por Samuel", "CRM in development by Samuel")}
          body={pick(lang,
            "El CRM operativo (leads, pipeline, calendario, métricas e importación de prospectos) se está construyendo en la rama feature/avalon-crm-foundation (PR #6). Cuando se apruebe y fusione, aparecerá aquí sin cambios en el resto de Avalon OS.",
            "The operational CRM (leads, pipeline, calendar, metrics and prospect import) is being built on feature/avalon-crm-foundation (PR #6). Once approved and merged it will appear here with no other Avalon OS changes.")}>
          <p className={s.meta}>{pick(lang, "Estado: en desarrollo · Pendiente de aprobación", "Status: in development · Pending approval")}</p>
        </Empty>
      </Panel>
    </Suite>
  );
}
