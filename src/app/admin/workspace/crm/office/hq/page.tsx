import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { Office } from "@/components/office/office";
import { ManagerExecutionStatus } from "@/components/office/manager-execution-status";
import { ExecutivePanel } from "@/components/office/executive-panel";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
export const dynamic = "force-dynamic";

/**
 * Avalon HQ — the ONE official office (owner-only). A single 3D scene (Higgsfield models + real data) followed by every
 * useful panel of the former Office: directory, presence, profiles, messages, tasks, KPIs, activity, the executive view
 * and the GitHub-native manager checks. /admin/workspace/crm/office redirects here.
 */
export default async function HqPage() {
  await requireOwner();
  const lang = await getLang();
  return (
    <Suite active="crm">
      <CrmNavigation active="office" />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 16 }}>
        <Office lang={lang} />
        <ExecutivePanel />
        <ManagerExecutionStatus lang={lang} />
      </div>
    </Suite>
  );
}
