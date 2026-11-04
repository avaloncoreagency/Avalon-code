import {createHash} from 'node:crypto';
import Ajv from 'ajv';
import schema from '../../../schemas/creative-bridge/manifest.schema.json';
import {parseCreativeDelivery, type CreativeDelivery} from '../os/creative-bridge-protocol';
export type Agent = 'codex'|'claude';
export type Asset = {id:string;public_path?:string;kind:'image'|'video';alt:string; state:'pending'|'generating'|'ready'|'failed'|'cancelled'; job_ref:string|null; storage_ref:string|null; sha256:string|null; reduced_motion_ref:string|null};
export type Evidence = {pull_request?:string|null;ci_url?:string|null;preview_url?:string|null;demo_url?:string|null;production_url?:string|null;observed_at?:string};
export type Manifest = {evidence?:Evidence;schema_version:1; task_id:string; project_ref:string; owner:'miguel'|'samuel'; agent:Agent; branch:string; head_sha:string; ci:'UNKNOWN'|'PENDING'|'PASSED'|'FAILED'; next_action:string; delivery:CreativeDelivery|null; assets:Asset[]; events:{id:string;digest:string}[]; receipt:{project_id:string;lead_id:string}|null; history:{sha:string;agent:Agent;action:string}[]};
const validate = new Ajv({allErrors:true}).compile(schema);
export function manifest(input:unknown):Manifest {
  if(!validate(input))throw Error('Invalid private creative manifest');
  const value=JSON.parse(JSON.stringify(input)) as Manifest;
  if(value.delivery){value.delivery=parseCreativeDelivery(value.delivery);if(value.delivery.source_ref!==value.project_ref)throw Error('Project reference mismatch');}
  for(const field of ['preview_url','demo_url','production_url'] as const){const link=value.evidence?.[field];if(link){const parsed=new URL(link);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Unsafe evidence URL');}}
  if(!value.delivery && value.receipt)throw Error('Unassigned project cannot claim a receipt');
  if(new Set(value.assets.map(a=>a.id)).size!==value.assets.length || new Set(value.events.map(e=>e.id)).size!==value.events.length)throw Error('Duplicate identity');
  for(const asset of value.assets)if(asset.state==='ready'&&(!asset.sha256||!asset.storage_ref))throw Error('Ready asset requires durable storage and checksum');
  for(const asset of value.assets)if(asset.public_path&&(!asset.sha256||!asset.public_path.startsWith('/creative-bridge/'+asset.sha256+'.')))throw Error('Asset path checksum mismatch');
  for(const asset of value.assets)if(asset.state==='ready'&&asset.kind==='video'&&!asset.reduced_motion_ref)throw Error('Video requires reduced-motion resource');
  return value;
}
export type Event = {id:string;source_sha:string;kind:'checkpoint'|'asset.result';agent:Agent;next_action?:string;asset?:Asset};
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value) ?? 'null';
}
export function reconcile(input:Manifest,event:Event):Manifest {
  const state=manifest(input);
  if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(event.id)||!['codex','claude'].includes(event.agent)||!['checkpoint','asset.result'].includes(event.kind))throw Error('Invalid event');
  const digest=createHash('sha256').update(canonical(event)).digest('hex');
  const old=state.events.find(e=>e.id===event.id);
  if(old){if(old.digest!==digest)throw Error('Conflicting replay');return state;}
  if(event.source_sha!==state.head_sha)throw Error('Stale source; regenerate checkpoint');
  if(event.kind==='checkpoint') {
    if(event.agent!==state.agent)throw Error('Use explicit handoff to change agent');
    if(!event.next_action)throw Error('Missing next action');state.next_action=event.next_action;
  } else {
    if(event.agent!==state.agent)throw Error('Agent conflict');
    if(!event.asset)throw Error('Missing asset');
    const index=state.assets.findIndex(a=>a.id===event.asset!.id);
    if(index<0)throw Error('Unknown asset; register its request first');
    const before=state.assets[index];
    const allowed:Record<Asset['state'],Asset['state'][]>={pending:['generating','failed','cancelled'],generating:['ready','failed','cancelled'],ready:[],failed:['pending'],cancelled:[]};
    if(!allowed[before.state].includes(event.asset.state))throw Error('Invalid asset transition');
    state.assets[index]=event.asset;
  }
  state.events.push({id:event.id,digest});state.history.push({sha:state.head_sha,agent:event.agent,action:event.kind});return manifest(state);
}
export function handoff(input:Manifest,to:Agent,expectedSha:string,nextAction:string):Manifest {
  const state=manifest(input);if(state.head_sha!==expectedSha)throw Error('Source advanced');
  if(!['codex','claude'].includes(to)||to===state.agent)throw Error('Invalid target');
  state.history.push({sha:state.head_sha,agent:state.agent,action:'handoff:'+to});state.agent=to;state.next_action=nextAction;return manifest(state);
}
export function advance(input:Manifest,expectedSha:string,newSha:string,branch:string,nextAction:string):Manifest {
  const state=manifest(input);
  if(state.head_sha!==expectedSha||!/^[a-f0-9]{40}$/.test(newSha)||newSha===expectedSha)throw Error('Invalid source advance');
  state.history.push({sha:expectedSha,agent:state.agent,action:'advance:'+newSha});
  state.head_sha=newSha;state.branch=branch;state.ci='UNKNOWN';state.next_action=nextAction;
  return manifest(state);
}
export function overlaps(a:Manifest,b:Manifest,areasA:string[],areasB:string[]) {
  return a.task_id!==b.task_id&&areasA.some(p=>areasB.includes(p));
}
export function registrationPlan(input:Manifest) {
  const m=manifest(input);
  if(!m.delivery)return {status:'unassigned' as const,reason:'Private checkpoint only; no lead invented'};
  if(m.ci!=='PASSED')return {status:'blocked' as const,reason:'Passing technical verification required'};
  return {status:'ready_for_authorized_submission' as const,delivery:m.delivery,reference_only:true};
}
export async function register(input:Manifest,transport?: (d:CreativeDelivery)=>Promise<{project_id:string;lead_id:string}>) {
  const m=manifest(input),plan=registrationPlan(m);
  if(plan.status!=='ready_for_authorized_submission')return {manifest:m,status:plan.status};
  if(m.receipt)return {manifest:m,status:'recorded' as const};
  if(!transport)return {manifest:m,status:'blocked' as const};
  // Production transport must use #87's signed, authenticated receptor. No DB bypass here.
  try{m.receipt=await transport(plan.delivery);return {manifest:manifest(m),status:'recorded' as const};}
  catch{return {manifest:manifest(input),status:'failed' as const};}
}
