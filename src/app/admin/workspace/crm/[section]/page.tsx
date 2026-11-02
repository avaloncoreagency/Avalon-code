import { notFound } from 'next/navigation';
import { Suite } from '@/components/suite/suite';
import { Crm, crmSections, type CrmSection } from '@/components/crm/crm';
export const dynamic = 'force-dynamic';
export default async function CrmSectionPage({params}:{params:Promise<{section:string}>}){
 const {section}=await params;
 if(!crmSections.some(item=>item.slug===section)) notFound();
 return <Suite active="crm"><Crm section={section as CrmSection}/></Suite>;
}
