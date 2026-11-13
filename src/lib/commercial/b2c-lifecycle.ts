import {evaluateContractorRoute, type ContractorRoutePolicy,type VisitorRouteRequest} from "./routing";
/**
 * Pure prospective B2C lifecycle. Safe for synthetic fixtures only until a
 * separate owner-approved persistence backend enforces RLS and transactions.
 * Does not persist PII, create jobs, mark invoices paid or contact contractors.
 */
export type B2cStatus="routed"|"acknowledged"|"contacted"|"quote_sent"|"won"|"lost";
export type B2cEvent={eventId:string;nextStatus:Exclude<B2cStatus,"routed">;actorId:string;timestampMs:number};
export type B2cCase={
 requestId:string;campaignId:string;policyVersion:number;contractorId:string;
 disclosedContractorId:string;consentVersion:string;status:B2cStatus;
 revision:number;events:readonly B2cEvent[];
};
export type Result<T>={ok:true;value:T;replayed?:boolean}|{ok:false;error:string};
const ID=/^[a-zA-Z0-9_-]{4,80}$/;
export function openB2cCase(requestId:string,consentVersion:string,
 policy:ContractorRoutePolicy,request:VisitorRouteRequest):Result<B2cCase>{
 if(!ID.test(requestId)||!ID.test(consentVersion))
   return {ok:false,error:"invalid_reference"};
 const decision=evaluateContractorRoute(policy,request);
 if(decision.status!=="eligible"||!decision.contractorId)
   return {ok:false,error:"routing_blocked:"+decision.reasons.join(",")};
 return {ok:true,value:{
  requestId,campaignId:policy.campaignId,policyVersion:policy.version,
  contractorId:policy.contractorId,disclosedContractorId:request.displayedContractorId,
  consentVersion,status:"routed",revision:1,events:[]
 }};
}
const ALLOWED:Record<B2cStatus,readonly B2cStatus[]>={
 routed:["acknowledged","lost"],acknowledged:["contacted","lost"],
 contacted:["quote_sent","lost"],quote_sent:["won","lost"],won:[],lost:[]
};
export function applyB2cEvent(existing:B2cCase,expectedRevision:number,event:B2cEvent):Result<B2cCase>{
 if(!ID.test(event.eventId)||!ID.test(event.actorId)||!Number.isFinite(event.timestampMs))
   return {ok:false,error:"invalid_event"};
 const previous=existing.events.find(e=>e.eventId===event.eventId);
 if(previous){
  if(previous.nextStatus===event.nextStatus&&previous.actorId===event.actorId&&previous.timestampMs===event.timestampMs)
   return {ok:true,value:existing,replayed:true};
  return {ok:false,error:"idempotency_conflict"};
 }
 if(!Number.isSafeInteger(expectedRevision)||existing.revision!==expectedRevision)
   return {ok:false,error:"version_conflict"};
 if(!ALLOWED[existing.status].includes(event.nextStatus))
   return {ok:false,error:"invalid_transition"};
 if(existing.events.length>=200)return {ok:false,error:"event_limit"};
 return {ok:true,value:{...existing,status:event.nextStatus,revision:existing.revision+1,events:[...existing.events,event]}};
}
