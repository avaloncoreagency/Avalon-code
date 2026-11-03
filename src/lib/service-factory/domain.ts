/** Pure, dependency-free validation for Avalon Service Factory (owner-only admin). */
export const SERVICE_FAMILIES = ['general','web','ecommerce','crm','ai','automation','marketing','brand','creative'] as const;
export const SERVICE_READINESS = ['draft','internal_ready','sellable','paused','retired'] as const;
export const SERVICE_DEPARTMENTS = ['website','ecommerce','crm_creator','receptionist','marketing','sales'] as const;
export const SERVICE_BILLING = ['one_time','monthly','annual'] as const;
export type ServiceFamily = typeof SERVICE_FAMILIES[number];
export type ServiceReadiness = typeof SERVICE_READINESS[number];
export type ServiceDepartment = typeof SERVICE_DEPARTMENTS[number];
export type ServiceBilling = typeof SERVICE_BILLING[number];

export type TaskTemplate = { title: string; offset_days?: number; priority?: 'low'|'normal'|'high'|'urgent' }[];
export type ServiceCatalogInput = {
  code: string; name: string; name_en: string; department_id: ServiceDepartment;
  billing_type: ServiceBilling; suggested_price: string | null;
  family: ServiceFamily; readiness: ServiceReadiness;
  deliverables: string; requirements: string; exclusions: string;
  estimated_hours: string | null; estimated_cost: string | null;
  qa_checklist: string[]; task_template: TaskTemplate; template_revision: number;
};

export type CatalogErrorCode =
  | 'required' | 'invalid_code' | 'invalid_choice' | 'too_long'
  | 'invalid_text' | 'invalid_amount' | 'invalid_template'
  | 'invalid_checklist' | 'invalid_revision';

export class CatalogInputError extends Error {
  constructor(public code: CatalogErrorCode) { super(code); }
}
type FormLike = { get(key: string): unknown };
const BANNED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

function str(form: FormLike, key: string, max: number, min = 0) {
  const raw = form.get(key);
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (BANNED.test(value)) throw new CatalogInputError('invalid_text');
  if (value.length > max) throw new CatalogInputError('too_long');
  if (value.length < min) throw new CatalogInputError('required');
  return value;
}
function choice<T extends readonly string[]>(value: string, allowed: T): T[number] {
  if (!(allowed as readonly string[]).includes(value)) throw new CatalogInputError('invalid_choice');
  return value as T[number];
}
function amount(form: FormLike, key: string, max: number): string | null {
  const raw = str(form, key, 30);
  if (!raw) return null;
  if (!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$/.test(raw) || Number(raw) > max)
    throw new CatalogInputError('invalid_amount');
  return raw;
}
function tasks(raw: string): TaskTemplate {
  let parsed: unknown;
  try { parsed = JSON.parse(raw || '[]'); } catch { throw new CatalogInputError('invalid_template'); }
  if (!Array.isArray(parsed) || parsed.length > 25) throw new CatalogInputError('invalid_template');
  const result: TaskTemplate = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CatalogInputError('invalid_template');
    const task = item as Record<string, unknown>;
    if (typeof task.title !== 'string' || task.title.trim().length < 1 || task.title.trim().length > 200 || BANNED.test(task.title))
      throw new CatalogInputError('invalid_template');
    const value: TaskTemplate[number] = { title: task.title.trim() };
    if (task.offset_days !== undefined) {
      if (typeof task.offset_days !== 'number' || !Number.isInteger(task.offset_days) || task.offset_days < 0 || Number(task.offset_days) > 365)
        throw new CatalogInputError('invalid_template');
      value.offset_days = task.offset_days as number;
    }
    if (task.priority !== undefined) {
      if (!['low','normal','high','urgent'].includes(String(task.priority))) throw new CatalogInputError('invalid_template');
      value.priority = task.priority as TaskTemplate[number]['priority'];
    }
    result.push(value);
  }
  if (JSON.stringify(result).length > 32768) throw new CatalogInputError('invalid_template');
  return result;
}
function checklist(raw: string) {
  const lines = raw.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  if (lines.length > 25 || lines.some(v => v.length > 140 || BANNED.test(v)) ||
      JSON.stringify(lines).length > 6000) throw new CatalogInputError('invalid_checklist');
  return lines;
}

export function parseServiceCatalogForm(form: FormLike): ServiceCatalogInput {
  const code = str(form, 'code', 50, 2);
  if (!/^[a-z][a-z0-9-]{1,49}$/.test(code)) throw new CatalogInputError('invalid_code');
  const revision = str(form, 'template_revision', 7, 1);
  if (!/^[1-9][0-9]{0,5}$/.test(revision)) throw new CatalogInputError('invalid_revision');
  return {
    code,
    name: str(form,'name',120,1),
    name_en: str(form,'name_en',120),
    department_id: choice(str(form,'department_id',30), SERVICE_DEPARTMENTS),
    billing_type: choice(str(form,'billing_type',20), SERVICE_BILLING),
    suggested_price: amount(form,'suggested_price',1_000_000_000_000),
    family: choice(str(form,'family',25), SERVICE_FAMILIES),
    readiness: choice(str(form,'readiness',30), SERVICE_READINESS),
    deliverables: str(form,'deliverables',4000),
    requirements: str(form,'requirements',4000),
    exclusions: str(form,'exclusions',4000),
    estimated_hours: amount(form,'estimated_hours',10000),
    estimated_cost: amount(form,'estimated_cost',1_000_000_000_000),
    qa_checklist: checklist(str(form,'qa_checklist',7000)),
    task_template: tasks(str(form,'task_template',32768)),
    template_revision: Number(revision),
  };
}

export function serviceCatalogPayload(input: ServiceCatalogInput) {
  return {
    name: input.name, name_en: input.name_en,
    department_id: input.department_id, billing_type: input.billing_type,
    suggested_price: input.suggested_price, family: input.family,
    readiness: input.readiness, deliverables: input.deliverables,
    requirements: input.requirements, exclusions: input.exclusions,
    estimated_hours: input.estimated_hours, estimated_cost: input.estimated_cost,
    qa_checklist: input.qa_checklist, task_template: input.task_template,
    template_revision: input.template_revision,
  };
}
