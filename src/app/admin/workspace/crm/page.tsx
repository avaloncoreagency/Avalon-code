import { Suite } from "@/components/suite/suite";
import { CrmOverview } from "@/components/crm/overview";
export const dynamic = "force-dynamic";
export default function CrmPage() {
  return (
    <Suite active="crm">
      <CrmOverview />
    </Suite>
  );
}
