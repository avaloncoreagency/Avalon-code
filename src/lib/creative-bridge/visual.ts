/** Explicit provider port: assistant connectors are never assumed to exist in Next.js. */
export type VisualRequest = {id:string;model:string;kind:'image'|'video';brief:string;alt:string;reduced_motion:boolean};
export interface VisualPort {
  quote(request:VisualRequest):Promise<{credits:number|null;quote_ref:string;expires_at:number}>;
  start(request:VisualRequest,quoteRef:string):Promise<{job_ref:string}>;
}
export async function prepareVisual(request:VisualRequest,port?:VisualPort) {
  if(!request.id||!request.model||!request.brief||request.brief.length>2000||!request.alt||request.alt.length>500||!['image','video'].includes(request.kind))throw Error('Invalid visual request');
  if(request.kind==='video'&&!request.reduced_motion)throw Error('Video needs a reduced-motion fallback plan');
  if(!port)return {status:'blocked' as const,reason:'Provider connection unavailable',credits:null};
  try {const quote=await port.quote(request);return {status:'pending' as const,quote};}
  catch{return {status:'failed' as const,reason:'Provider quote unavailable',credits:null};}
}
export async function generateVisual(request:VisualRequest,port:VisualPort,approval:{request_id:string;quote_ref:string;max_credits:number}|null) {
  // The caller must record explicit human spending approval. No automatic generation.
  if(!approval||approval.request_id!==request.id||!Number.isFinite(approval.max_credits)||approval.max_credits<0)throw Error('Explicit budget approval required');
  const prepared=await prepareVisual(request,port);
  if(prepared.status!=='pending')return prepared;
  const q=prepared.quote;
  if(q.quote_ref!==approval.quote_ref||q.expires_at<=Date.now()||q.credits===null||!Number.isFinite(q.credits)||q.credits<0||q.credits>approval.max_credits)throw Error('Quote is stale, unknown or over budget');
  try {return {status:'generating' as const,...await port.start(request,q.quote_ref)};}
  catch {return {status:'failed' as const,reason:'Provider generation unavailable'};}
}
