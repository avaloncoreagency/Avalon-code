import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { Office } from "@/components/office/office";
import { ManagerExecutionStatus } from "@/components/office/manager-execution-status";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
export const dynamic = "force-dynamic";

/** Oficina / Office: Avalon HQ — team directory, profiles, tasks, messages and AI managers (owner-only). */
export default async function OfficePage() {
  await requireOwner();
  const lang = await getLang();
  return (
    <Suite active="crm">
      <CrmNavigation active="office" />
      <div style={{ padding: "12px 24px" }}><Link href="/admin/workspace/crm/office/hq">Avalon HQ 3D (nueva oficina, vista previa)</Link> · <Link href="/admin/workspace/crm/office/manager-work">Abrir estaciones de trabajo · ejecutar las cinco comprobaciones reales</Link></div>
      <ManagerExecutionStatus lang={lang} />
      <Office lang={lang} />
    </Suite>
  );
}
