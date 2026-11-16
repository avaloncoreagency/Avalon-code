import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";


/** The CRM entry points to the daily Pipeline workspace; no duplicate dashboard. */
export default function CrmPage() {
  redirect("/admin/workspace/crm/leads");
}
