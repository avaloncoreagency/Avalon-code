import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { ManagerOperations } from "@/components/office/manager-operations";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { isManagerKey } from "@/lib/office/manager-operations-ui";

export const dynamic = "force-dynamic";

/** Read-only operational UI. Keep the Office 3D scene and Claude's engine untouched. */
export default async function ManagerOperationsPage({
  searchParams,
}: { searchParams: Promise<{ manager?: string }> }) {
  await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const manager = isManagerKey(p.manager) ? p.manager : "ren";
  return <Suite active="crm">
    <CrmNavigation active="office" />
    <ManagerOperations lang={lang} initialManager={manager}/>
  </Suite>;
}
