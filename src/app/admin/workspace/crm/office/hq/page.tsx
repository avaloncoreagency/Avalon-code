import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { Office } from "@/components/office/office";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
export const dynamic = "force-dynamic";

/**
 * Avalon HQ is the one canonical Office for Miguel and Samuel.
 * The historical /office route already redirects here. Manager engine
 * telemetry is intentionally not mounted in the primary owner experience.
 * All manager components and routes remain available for a later phase.
 */
export default async function HqPage() {
  await requireOwner();
  const lang = await getLang();
  return (
    <Suite active="crm">
      <CrmNavigation active="office" />
      <div style={{ padding: "0 16px 16px" }}>
        <Office lang={lang} />
      </div>
    </Suite>
  );
}
