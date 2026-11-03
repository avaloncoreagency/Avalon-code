import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { Office } from "@/components/office/office";
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
      <Office lang={lang} />
    </Suite>
  );
}
