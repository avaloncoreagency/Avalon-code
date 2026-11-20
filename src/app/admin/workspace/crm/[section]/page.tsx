import { notFound } from "next/navigation";
import { getLang } from "@/lib/i18n-server";
import { LeadWorkbench } from "@/components/crm/lead-workbench";
import { Suite } from "@/components/suite/suite";
import { Crm } from "@/components/crm/crm";
import Link from "next/link";
import { radarExternalEnabled } from "@/lib/crm/radar-control";
import { requireOwner } from "@/lib/auth/session";
import { pick } from "@/lib/i18n";
import s from "@/components/sales/sales.module.css";
import {
  sections as crmSections,
  type Section as CrmSection,
  uuid,
} from "@/lib/crm/domain";
export const dynamic = "force-dynamic";

export default async function CrmSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ lead?: string | string[] }>;
}) {
  const lang = await getLang();
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!crmSections.some((item) => item.slug === section)) notFound();
  // Radar is HIBERNATED (owner directive, 2026-11-20): its code and history are preserved, but nothing is rendered,
  // fetched or initialised (no map tiles, no provider calls) unless the server-side switch is explicitly enabled.
  if (section === "hunter" && !radarExternalEnabled()) {
    await requireOwner();
    return <Suite active="crm"><section className={s.hud} aria-labelledby="radar-suspended">
      <header className={s.header}><div><p className={s.eyebrow}>CRM / Radar</p>
        <h1 id="radar-suspended">{pick(lang, "Radar está suspendido", "Radar is suspended")}</h1>
        <p className={s.lead}>{pick(lang, "Por decisión de los propietarios, Radar está en hibernación: no busca negocios, no consulta proveedores externos y no genera costos. Su código y su historial se conservan para una futura reactivación.", "By owner decision, Radar is hibernated: it does not search businesses, call external providers or generate costs. Its code and history are preserved for a future reactivation.")}</p></div></header>
      <div className={s.actions}>
        <Link className={`${s.button} ${s.primary}`} href="/admin/workspace/crm/leads#crm-create-lead">{pick(lang, "Crear lead manualmente", "Create a lead manually")}</Link>
        <Link className={s.button} href="/admin/workspace/crm/inbound">{pick(lang, "Solicitudes del website", "Website inquiries")}</Link>
        <Link className={s.button} href="/admin/workspace/crm/leads">{pick(lang, "Ir al pipeline", "Go to pipeline")}</Link>
      </div>
    </section></Suite>;
  }
  // A Radar deep link is an exact ID filter; never accept arbitrary PostgREST queries.
  const focusLeadId = section === "leads" && typeof query.lead === "string" && uuid.test(query.lead)
    ? query.lead : undefined;
  return (
    <Suite active="crm">
      <Crm section={section as CrmSection} focusLeadId={focusLeadId} lang={lang} />
      {section === "leads" && !focusLeadId && <LeadWorkbench />}
    </Suite>
  );
}
