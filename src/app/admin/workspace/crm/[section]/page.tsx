import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { Crm } from "@/components/crm/crm";
import {
  sections as crmSections,
  type Section as CrmSection,
  uuid,
} from "@/lib/crm/domain";
export const dynamic = "force-dynamic";

export default async function CrmSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ lead?: string | string[] }>;
}) {
  const [{ section }, query] = await Promise.all([params, searchParams]);
  if (!crmSections.some((item) => item.slug === section)) notFound();
  // A Radar deep link is an exact ID filter; never accept arbitrary PostgREST queries.
  const focusLeadId = section === "leads" && typeof query.lead === "string" && uuid.test(query.lead)
    ? query.lead : undefined;
  return (
    <Suite active="crm">
      <Crm section={section as CrmSection} focusLeadId={focusLeadId} />
    </Suite>
  );
}
