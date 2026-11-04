import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { ManagerWorkstation } from "@/components/office/manager-workstation";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** Owner-triggered jobs; not an autonomous scheduled worker. */
export default async function OfficeManagerWorkPage() {
  await requireOwner();
  const lang = await getLang();
  return <Suite active="crm">
    <CrmNavigation active="office" />
    <ManagerWorkstation lang={lang} />
  </Suite>;
}
