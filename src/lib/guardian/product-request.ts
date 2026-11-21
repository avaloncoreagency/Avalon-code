import { diagnoseIncident, type Context, type Incident } from './diagnostics';
import { readProductState } from '../os/client-hud';
/** Proposal for the EXISTING saveProductOperation form, not a remote writer or authorization decision. */
export function proposeProductRequest(incident:Incident,context:Context,project:{id:string;client_id:string|null;version:number;settings:Record<string,unknown>},expectedVersion:number){
  if(project.id!==context.projectId||project.client_id!==context.clientId)throw Error('scope_mismatch');
  if(!Number.isSafeInteger(expectedVersion)||project.version!==expectedVersion)throw Error('version_conflict');
  const state=readProductState(project.settings.client_hud);
  if(state.requests.some(r=>r.id===incident.id))throw Error('incident_already_recorded');
  const d=diagnoseIncident(incident,context);
  return {target:'saveProductOperation',projectId:project.id,expectedVersion,operation:'request',requestId:incident.id,
    fields:{title:`Guardian · ${incident.runbook}`,details:`Structured diagnostic: ${d.classification}. No repair executed. Evidence IDs: ${d.evidenceIds.join(', ')}.`,kind:'bug',severity:d.severity,
      expected:'Authorized functionality restored and independently verified.',actual:d.classification,reproduction:`Runbook: ${incident.runbook}; observations: ${d.evidenceIds.join(', ')}`,
      checklist:'Review authorized source evidence\nReview proposed repair or escalation\nIndependently verify outcome'},
    requiresOwnerReview:true as const,execute:false as const};
}
