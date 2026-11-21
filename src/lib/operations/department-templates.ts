import { DEPARTMENTS, type Department, type MissionTask } from './mission-plan';
export const DEPARTMENT_OUTPUTS:Record<Department,string>={
  business_strategy:'Proposed offer, assumptions, owner-approved pricing decision and margin review.',
  sales_marketing:'Ideal client profile and reviewed EN/ES outreach draft; no automatic sending.',
  client_operations:'Onboarding requirements, delivery checklist and explicit customer acceptance.',
  product_studio:'Reusable product brief, mobile/accessibility and measured performance criteria.',
  finance_kpis:'Defined KPI formula, source coverage, currency and approved accounting interpretation.',
  legal_compliance:'Draft clauses and unresolved questions for qualified legal review; never legal validation.',
  cloud_security:'Resource ownership, data isolation, restore evidence and commercial plan verification.',
  ai_orchestrator:'Bounded dependency plan with connected executors, approval and stop conditions.',
  guardian:'Structured incident evidence, read-only diagnosis and independent repair verification.',
  quality_assurance:'Exact-SHA acceptance evidence with negative, mobile and recovery tests.',
  knowledge_innovation:'Versioned decision, sources, superseded records and next review trigger.',
};
/** Departments are human/document templates, not eleven invocable ChatGPT chats or paid models. */
export function departmentSequence():MissionTask[]{return DEPARTMENTS.map((department,i)=>({id:'dept-'+department.replaceAll('_','-'),department,mode:'manual',dependsOn:i?['dept-'+DEPARTMENTS[i-1].replaceAll('_','-')]:[],acceptance:DEPARTMENT_OUTPUTS[department]}));}
export const PROVIDER_CONNECTIONS=[
  {provider:'ChatGPT',status:'MANUAL'}, {provider:'Claude',status:'MANUAL'}, {provider:'Codex',status:'MANUAL'},
  {provider:'Groq',status:'UNKNOWN'}, {provider:'Cloudflare AI',status:'UNKNOWN'}, {provider:'Higgsfield',status:'MANUAL'},
  {provider:'GitHub Actions',status:'UNKNOWN'}, {provider:'Vercel',status:'UNKNOWN'}, {provider:'Supabase',status:'UNKNOWN'},
  {provider:'OpenRouter',status:'UNAVAILABLE'},
] as const; // static adapter availability, NOT an account balance or provider-health query
