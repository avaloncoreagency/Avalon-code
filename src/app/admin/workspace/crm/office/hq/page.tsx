import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { CrmNavigation } from "@/components/crm/navigation";
import { Hq3d } from "@/components/office/hq-3d";
import { requireOwner } from "@/lib/auth/session";
export const dynamic = "force-dynamic";

/** Avalon HQ 3D (preview inside the same HUD). The previous Office stays at /admin/workspace/crm/office (rollback). */
export default async function HqPage() {
  await requireOwner();
  return (
    <Suite active="crm">
      <CrmNavigation active="office" />
      <div style={{ padding: "8px 24px" }}><Link href="/admin/workspace/crm/office">← Oficina actual</Link></div>
      <div style={{ padding: "0 16px 16px" }}><Hq3d /></div>
    </Suite>
  );
}
