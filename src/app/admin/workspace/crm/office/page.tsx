import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
export const dynamic = "force-dynamic";

/** The Office and Avalon HQ are one experience: keep every existing link working by redirecting to the official route. */
export default async function OfficePage() {
  await requireOwner();
  redirect("/admin/workspace/crm/office/hq");
}
