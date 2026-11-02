import { isUuid } from './domain';
export type Operations = { client_lead_id: string; responsible: string; url: string; repository: string; deployment: string; integrations: string; resources: string; tasks: string; important_dates: string };
export function operations(input: Record<string, unknown>): Operations {
  const result = {} as Operations;
  for (const key of ['client_lead_id','responsible','url','repository','deployment','integrations','resources','tasks','important_dates'] as const) {
    const value = input[key];
    if (value != null && typeof value !== 'string') throw Error('Invalid project metadata');
    result[key] = String(value ?? '').trim();
    if (result[key].length > (['tasks','resources'].includes(key) ? 2000 : 500)) throw Error('Project field too long');
  }
  if (result.client_lead_id && !isUuid(result.client_lead_id)) throw Error('Invalid CRM reference');
  for (const key of ['url','repository'] as const) if (result[key]) {
    const url = new URL(result[key]);
    if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use a public HTTPS address');
    result[key] = url.href;
  }
  return result;
}
