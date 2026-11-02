import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { Crm } from "@/components/crm/crm";
import {
  sections as crmSections,
  type Section as CrmSection,
} from "@/lib/crm/domain";
export const dynamic = "force-dynamic";
export default async function CrmSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!crmSections.some((item) => item.slug === section)) notFound();
  return (
    <Suite active="crm">
      <Crm section={section as CrmSection} />
    </Suite>
  );
}
