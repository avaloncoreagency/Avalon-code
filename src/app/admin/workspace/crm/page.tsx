import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Keep the owner gate before routing into the daily CRM workflow. */
export default async function CrmPage() {
  await requireOwner();
  redirect("/admin/workspace/crm/leads");
}
