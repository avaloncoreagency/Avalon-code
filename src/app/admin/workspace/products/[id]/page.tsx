import { notFound } from 'next/navigation';
import { Suite } from '@/components/suite/suite';
import { requireOwner } from '@/lib/auth/session';
import { getLang } from '@/lib/i18n-server';
import { clientId, isService, validId, SERVICES, type CompanyRecord } from '@/lib/os/client-hud';
import { run, PROJECT_COLUMNS, type ProjectRow, type AuditRow } from '@/lib/os/data';
import { productMetrics } from '@/lib/os/client-hud-data';
import { DbNotice } from '@/components/os/ui';
import { ProductHud } from '@/components/os/product-hud';
export const dynamic = 'force-dynamic';
export default async function ProductPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {supabase} = await requireOwner();
  const {id} = await params;
  if (!validId(id)) notFound();
  const lang = await getLang();
  const p = await searchParams;
  const result = await run<ProjectRow|null>(supabase.from('os_projects').select(PROJECT_COLUMNS).eq('id',id).maybeSingle());
  if (result.error) return <Suite><DbNotice lang={lang} error={result.error}/></Suite>;
  if (!result.data || !isService(result.data.module)) notFound();
  const project=result.data;
  const companyId=clientId(project.settings);
  const [company,metrics,audit]=await Promise.all([
    companyId?run<CompanyRecord|null>(supabase.from('crm_leads').select('id,company,contact,email,phone,source').eq('id',companyId).maybeSingle()):null,
    productMetrics(supabase,project),
    run<AuditRow[]>(supabase.from('os_audit').select('id,table_name,record_id,project_id,operation,actor_id,summary,created_at').eq('project_id',id).order('created_at',{ascending:false}).limit(20)),
  ]);
  return <Suite active={SERVICES[project.module].slug}><ProductHud lang={lang} project={project} company={company?.data??null} metrics={metrics} audit={audit} error={typeof p.error==='string'?p.error:undefined} ok={typeof p.ok==='string'?p.ok:undefined}/></Suite>;
}
