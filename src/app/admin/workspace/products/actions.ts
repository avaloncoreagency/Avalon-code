"use server";
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { ownerForAction, back, field, uuidField } from '@/lib/os/actions';
import { mapDbError } from '@/lib/os/data';
import { applyProductAction, clientId, isService, SERVICES } from '@/lib/os/client-hud';

export async function saveProductOperation(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form,'id');
  if (!id) back('/admin/dashboard',{error:'invalid'});
  const path = `/admin/workspace/products/${id}`;
  const version = Number(field(form,'version'));
  if (!Number.isSafeInteger(version) || version < 1) back(path,{error:'invalid'});
  const { data: project, error } = await supabase.from('os_projects').select('id,module,settings,status,version').eq('id',id).maybeSingle();
  if (error) back(path,{error:mapDbError(error)});
  if (!project || !isService(project.module)) back('/admin/dashboard',{error:'not_found'});
  if (project.status === 'archived') back(path,{error:'denied'});
  if (project.version !== version) back(path,{error:'conflict'});
  let settings: Record<string,unknown>;
  try {
    settings = applyProductAction(project.settings,project.module,field(form,'operation'),Object.fromEntries(form),userId,new Date().toISOString(),randomUUID());
  } catch (e) { back(path,{error:e instanceof Error && e.message==='too_long'?'too_long':'invalid'}); }
  const saved = await supabase.from('os_projects').update({settings}).eq('id',id).eq('module',project.module).eq('version',version).select('id').maybeSingle();
  if (saved.error) back(path,{error:mapDbError(saved.error)});
  if (!saved.data) back(path,{error:'conflict'});
  revalidatePath(path);
  revalidatePath(`/admin/workspace/${SERVICES[project.module].slug}`);
  revalidatePath(`/admin/workspace/${SERVICES[project.module].slug}/${id}`);
  const companyId = clientId(settings);
  if (companyId) revalidatePath(`/admin/workspace/clients/${companyId}`);
  back(path,{ok:'saved'});
}

export async function saveCompanyNote(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form,'company_id');
  if (!id) back('/admin/dashboard',{error:'invalid'});
  const path = `/admin/workspace/clients/${id}`;
  const body = field(form,'body').trim();
  if (!body || body.length > 4000) back(path,{error:'invalid'});
  const company = await supabase.from('crm_leads').select('id').eq('id',id).maybeSingle();
  if (company.error || !company.data) back(path,{error:'not_found'});
  const { error } = await supabase.from('crm_activities').insert({lead_id:id,body,status:'completed',due_at:null});
  if (error) back(path,{error:mapDbError(error)});
  revalidatePath(path);
  revalidatePath('/admin/workspace/crm');
  back(path,{ok:'saved'});
}
