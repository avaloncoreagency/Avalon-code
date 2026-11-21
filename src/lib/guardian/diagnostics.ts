// Structured, offline L1 diagnostics. Ticket text never becomes a command, URL, permission or tool invocation.
export const RUNBOOKS=['availability','contact_form','authentication','deployment','rollback','recurring_error'] as const;
export type Runbook=typeof RUNBOOKS[number];
export type Code='healthy'|'http_5xx'|'timeout'|'form_failure'|'auth_denied'|'deploy_failed'|'rollback_requested'|'permission_alert';
export type Observation={id:string;clientId:string;projectId:string;code:Code;observedAt:string;observerId:string};
export type Incident={id:string;clientId:string;projectId:string;runbook:Runbook;observations:Observation[]};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CODES=['healthy','http_5xx','timeout','form_failure','auth_denied','deploy_failed','rollback_requested','permission_alert'];
export type Context={clientId:string;projectId:string;now:string};
function validateObservations(list:Observation[],context:Context):void{
  const now=Date.parse(context.now);
  if(!UUID.test(context.clientId)||!UUID.test(context.projectId)||!Number.isFinite(now)||!Array.isArray(list)||list.length<1||list.length>5)throw Error('invalid_observations');
  const ids=new Set<string>();
  for(const o of list){
    const at=Date.parse(o?.observedAt);
    if(!o||!UUID.test(o.id)||ids.has(o.id)||!UUID.test(o.observerId)||!CODES.includes(o.code)||!Number.isFinite(at)||at>now||now-at>600000)throw Error('invalid_or_stale_observation');
    if(o.clientId!==context.clientId||o.projectId!==context.projectId)throw Error('scope_mismatch');ids.add(o.id);
  }
}
export function diagnoseIncident(incident:Incident,context:Context){
  if(!incident||!UUID.test(incident.id)||!RUNBOOKS.includes(incident.runbook))throw Error('invalid_incident');
  if(incident.clientId!==context.clientId||incident.projectId!==context.projectId)throw Error('scope_mismatch');
  validateObservations(incident.observations,context);
  const ordered=[...incident.observations].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  const last=ordered.at(-1)!,previous=ordered.at(-2);
  const sustained=last.code!=='healthy'&&previous?.code===last.code&&Date.parse(last.observedAt)-Date.parse(previous.observedAt)>=1000;
  const critical=ordered.some(o=>o.code==='permission_alert');
  const requiresApproval=incident.runbook==='rollback'||critical||ordered.some(o=>o.code==='rollback_requested');
  return {incidentId:incident.id,clientId:incident.clientId,projectId:incident.projectId,runbook:incident.runbook,
    severity:critical?'P0':sustained||requiresApproval?'P1':'P2',level:requiresApproval?'L4':sustained?'L3':'L1',
    classification:last.code==='healthy'?'recovery_unverified':sustained?'persistent_failure':'single_observation',
    evidenceIds:ordered.map(o=>o.id),observedAt:last.observedAt,
    nextAction:requiresApproval?'Owner authorization and verified rollback/security plan required.':sustained?'Prepare a minimal reproduction and reviewed PR; no automatic repair.':'Collect a second authorized independent observation; no blind retry.',
    repairExecuted:false as const,providerCalls:0 as const,cost:'no medido',
  };
}
/** Review contract only: the caller must retrieve authorized evidence, not trust a user-supplied attestation. */
export function verifyRecovery(incident:Incident,after:Observation[],context:Context){
  diagnoseIncident(incident,context);validateObservations(after,context);
  const before=new Set(incident.observations.map(o=>o.id)),originalObservers=new Set(incident.observations.map(o=>o.observerId));
  const lastFailure=Math.max(...incident.observations.map(o=>Date.parse(o.observedAt)));
  const ordered=[...after].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  const passed=ordered.length>=2&&ordered.every(o=>o.code==='healthy'&&!before.has(o.id)&&!originalObservers.has(o.observerId)&&Date.parse(o.observedAt)>lastFailure)&&Date.parse(ordered.at(-1)!.observedAt)-Date.parse(ordered[0].observedAt)>=1000;
  return {status:passed?'VERIFIED_FOR_OWNER_REVIEW':'UNVERIFIED',incidentId:incident.id,evidenceIds:after.map(o=>o.id),closeAuthorized:false as const};
}
