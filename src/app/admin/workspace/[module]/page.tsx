import { notFound, redirect } from "next/navigation";
import { moduleBySlug } from "@/components/suite/modules";
import { requireOwner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Every module, including the CRM, has its own static route that takes
// precedence over this segment. This fallback only normalizes legacy links
// (e.g. an old bookmark) to the real module screen; it never renders a
// placeholder. Unknown slugs are 404.
export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  await requireOwner();
  const { module } = await params;
  const item = moduleBySlug(module);
  if (!item || item.href === `/admin/workspace/${module}`) notFound();
  redirect(item.href);
}
