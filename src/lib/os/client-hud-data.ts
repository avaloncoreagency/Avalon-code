import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { countRows, type ProjectRow } from './data';
export type ProductMetric = { es: string; en: string; value: number | null };
export async function productMetrics(client: SupabaseClient, project: ProjectRow): Promise<ProductMetric[]> {
  const count = async (table: string, es: string, en: string, state?: string): Promise<ProductMetric> => {
    const filters: NonNullable<Parameters<typeof countRows>[2]> = [['eq','project_id',project.id]];
    if (state) filters.push(['eq','status',state]);
    const result = await countRows(client,table,filters);
    return {es,en,value:result.error?null:result.count};
  };
  switch (project.module) {
    case 'website': return Promise.all([count('os_website_pages','P\u00e1ginas guardadas','Saved pages'),count('os_website_pages','Publicadas internamente','Internally published','published')]);
    case 'ecommerce': return Promise.all([count('os_store_products','Productos guardados','Saved products'),count('os_store_products','Productos activos','Active products','active')]);
    case 'receptionist': return [await count('os_receptionist_entries','Entradas de conocimiento','Knowledge entries')];
    case 'marketing': return Promise.all([count('os_marketing_items','Piezas registradas','Registered content'),count('os_marketing_items','Marcadas publicadas','Marked published','published')]);
    case 'crm_creator': {
      const value = project.settings.blueprint;
      const bp = value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : null;
      return [{es:'Entidades configuradas',en:'Configured entities',value:Array.isArray(bp?.entities)?bp.entities.length:null},{es:'Pipelines configurados',en:'Configured pipelines',value:Array.isArray(bp?.pipelines)?bp.pipelines.length:null}];
    }
  }
}
