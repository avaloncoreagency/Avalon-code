// Additive planner for crm_agent_mission_start. No dispatcher, network, scheduler or second persistence engine.
import { createHash } from 'node:crypto';
import { CAPABILITY, type ManagerKey } from '../agents/policy';

export const DEPARTMENTS = ['business_strategy','sales_marketing','client_operations','product_studio','finance_kpis','legal_compliance','cloud_security','ai_orchestrator','guardian','quality_assurance','knowledge_innovation'] as const;
export type Department = typeof DEPARTMENTS[number];
export type MissionTask = { id:string; department:Department; mode:'diagnostic'|'manual'; manager?:ManagerKey; dependsOn:string[]; acceptance:string };
export type MissionPlan = { schema:1; id:string; objective:string; authorizedBy:string; clientId:string|null; priority:'P0'|'P1'|'P2'; createdAt:string;
  budget:{ maxSteps:number; maxAttempts:1; externalUsd:0 }; tasks:MissionTask[]; nextAction:string };
export type PlanControls = { enabled:boolean; paused:boolean; suspendedManagers:ManagerKey[] };
export type CompiledMission = { status:'PLANNED'|'BLOCKED'|'PAUSED'|'WAITING_APPROVAL'; reasons:string[]; key:string|null; title:string;
  steps:{ manager:ManagerKey; capability:string; depends_on:number[] }[]; taskOrder:string[] };
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID=/^[a-z][a-z0-9-]{2,59}$/;
const managers=['ren','shin','haru','kenji'] as const; // SORA/Radar intentionally excluded from OMEGA execution.
const bounded=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function validatePlan(p:MissionPlan):void {
  if(!p||p.schema!==1||!ID.test(p.id)||!bounded(p.objective,160)||!UUID.test(p.authorizedBy)||p.clientId!==null&&!UUID.test(p.clientId)||!['P0','P1','P2'].includes(p.priority)||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(p.createdAt)||!Number.isFinite(Date.parse(p.createdAt))||!bounded(p.nextAction,300))throw Error('invalid_plan');
  if(!p.budget||!Number.isSafeInteger(p.budget.maxSteps)||p.budget.maxSteps<1||p.budget.maxSteps>20||p.budget.maxAttempts!==1||p.budget.externalUsd!==0)throw Error('invalid_budget');
  if(!Array.isArray(p.tasks)||p.tasks.length<1||p.tasks.length>p.budget.maxSteps)throw Error('invalid_tasks');
  const ids=new Set<string>();
  for(const t of p.tasks){
    if(!t||!ID.test(t.id)||ids.has(t.id)||!DEPARTMENTS.includes(t.department)||!['manual','diagnostic'].includes(t.mode)||!bounded(t.acceptance,500)||!Array.isArray(t.dependsOn)||t.dependsOn.length>19||new Set(t.dependsOn).size!==t.dependsOn.length)throw Error('invalid_task');
    if(t.mode==='diagnostic'&&!(managers as readonly unknown[]).includes(t.manager))throw Error('executor_not_allowed');
    ids.add(t.id);
  }
  for(const t of p.tasks)if(t.dependsOn.some(d=>!ids.has(d)||d===t.id))throw Error('invalid_dependency');
}
export function compileMission(p:MissionPlan, actorId:string, control:PlanControls={enabled:false,paused:true,suspendedManagers:[]}):CompiledMission {
  validatePlan(p);
  const result:CompiledMission={status:'BLOCKED',reasons:[],key:null,title:p.objective,steps:[],taskOrder:[]};
  if(actorId!==p.authorizedBy){result.reasons.push('requester_mismatch');return result;}
  // Existing SQL diagnostics are agency-wide; never pretend they enforce a client-scoped result.
  if(p.clientId!==null){result.reasons.push('client_scoped_executor_unavailable');return result;}
  if(control.paused||!control.enabled){result.status='PAUSED';result.reasons.push('execution_disabled');return result;}
  if(p.tasks.some(t=>t.mode==='manual')){result.status='WAITING_APPROVAL';result.reasons.push('manual_department_work_requires_human');return result;}
  if(p.tasks.some(t=>control.suspendedManagers.includes(t.manager!))){result.reasons.push('manager_suspended');return result;}
  const pending=[...p.tasks],done=new Set<string>(),ordered:MissionTask[]=[];
  while(pending.length){const i=pending.findIndex(t=>t.dependsOn.every(d=>done.has(d)));if(i<0)throw Error('dependency_cycle');const [t]=pending.splice(i,1);done.add(t.id);ordered.push(t);}
  result.steps=ordered.map(t=>({manager:t.manager!,capability:CAPABILITY[t.manager!],depends_on:t.dependsOn.map(id=>ordered.findIndex(d=>d.id===id)+1)}));
  result.taskOrder=ordered.map(t=>t.id);
  // Canonical explicit fields: injected extra JSON fields cannot alter capabilities or RPC arguments.
  result.key='omega-'+createHash('sha256').update(JSON.stringify({id:p.id,objective:p.objective,actor:actorId,priority:p.priority,createdAt:p.createdAt,budget:{maxSteps:p.budget.maxSteps,maxAttempts:p.budget.maxAttempts,externalUsd:p.budget.externalUsd},tasks:ordered.map(t=>({id:t.id,department:t.department,acceptance:t.acceptance})),steps:result.steps})).digest('hex');
  result.status='PLANNED';return result;
}

export type MissionReceipt = { mission_id:string; status:string; requested_by:string; runs:{step:number;manager_key:string;capability:string;status:string;result_summary:string;contract_version:number}[] };
export type IndependentReview = {missionId:string; reviewerId:string; criteriaIds:string[]; result:'passed'|'failed'; observedAt:string};
/** A real SQL record is necessary but does not mean its diagnostic proves a business outcome. */
export function missionHandoff(plan:MissionPlan, compiled:CompiledMission, receipt:MissionReceipt|null,review:IndependentReview|null=null){
  const common={objective:plan.objective,owner:plan.authorizedBy,departmentTasks:plan.tasks.map(t=>({id:t.id,department:t.department,acceptance:t.acceptance})),dependencies:plan.tasks.flatMap(t=>t.dependsOn),nextAction:plan.nextAction,externalCost:'no medido',providerCalls:0 as const};
  if(compiled.status!=='PLANNED'||!receipt)return {...common,status:compiled.status==='PLANNED'?'BLOCKED':compiled.status,evidence:[] as string[],reason:compiled.reasons[0]??'no_execution_receipt'};
  const valid=UUID.test(receipt.mission_id)&&receipt.requested_by===plan.authorizedBy&&Array.isArray(receipt.runs)&&receipt.runs.length===compiled.steps.length&&receipt.runs.every((r,i)=>r.step===i+1&&r.manager_key===compiled.steps[i].manager&&r.capability===compiled.steps[i].capability&&r.status==='completed'&&r.contract_version>=1&&bounded(r.result_summary,2000));
  const reviewed=review&&review.missionId===receipt.mission_id&&UUID.test(review.reviewerId)&&review.reviewerId!==plan.authorizedBy&&review.result==='passed'&&Number.isFinite(Date.parse(review.observedAt))&&Array.isArray(review.criteriaIds)&&review.criteriaIds.length===compiled.taskOrder.length&&new Set(review.criteriaIds).size===review.criteriaIds.length&&compiled.taskOrder.every(id=>review.criteriaIds.includes(id));
  return {...common,status:receipt.status==='completed'&&valid?(reviewed?'COMPLETED':'VERIFYING'):'BLOCKED',evidence:valid?[`crm_agent_missions:${receipt.mission_id}`]:[],reason:valid?'SQL deterministic diagnostics only; independent review receipt required for acceptance.':'receipt_incomplete_or_mismatched'};
}
