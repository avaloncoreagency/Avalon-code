import {getOwnerSession} from '@/lib/auth/session';
import {getAppOrigin} from '@/lib/auth/policy';
import {manifest} from '@/lib/creative-bridge/continuity';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function POST(request:Request){
 const owner=await getOwnerSession();if(!owner)return reply({error:'Unauthorized'},401);
 try{if(request.headers.get('origin')!==getAppOrigin())return reply({error:'Origin rejected'},403);}catch{return reply({error:'Configuration unavailable'},503);}
 let input:Record<string,unknown>;
 try{
  const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid input'},400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return reply({error:'Too large'},413);}chunks.push(value);}
  input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Invalid input'},400);
 }catch{return reply({error:'Invalid input'},400);}
 try{
  let operation:string,args:Record<string,unknown>;
  if(input.operation==='create'){
   if(Object.keys(input).some(k=>!['operation','module','source_ref','name','description','agent'].includes(k)))return reply({error:'Invalid input'},400);
   if(!['website','ecommerce','crm_creator'].includes(String(input.module))||!['codex','claude'].includes(String(input.agent))||typeof input.source_ref!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(input.source_ref)||typeof input.name!=='string'||!input.name.trim()||input.name.length>120||typeof input.description!=='string'||input.description.length>2000)return reply({error:'Invalid input'},400);
   operation='os_create_unassigned_creative_project';args={p_module:input.module,p_source_ref:input.source_ref,p_name:input.name,p_description:input.description,p_agent:input.agent};
  }else{
   if(!uuid(input.project_id)||!Number.isSafeInteger(input.version)||Number(input.version)<1)return reply({error:'Invalid input'},400);
   if(input.operation==='link'){
    if(Object.keys(input).some(k=>!['operation','project_id','version','lead_id'].includes(k))||!uuid(input.lead_id))return reply({error:'Invalid input'},400);
    operation='os_link_creative_project';args={p_project_id:input.project_id,p_version:input.version,p_lead_id:input.lead_id};
   }else if(input.operation==='sale'){
    if(Object.keys(input).some(k=>!['operation','project_id','version','sale_id'].includes(k))||!uuid(input.sale_id))return reply({error:'Invalid input'},400);
    operation='os_link_creative_sale';args={p_project_id:input.project_id,p_version:input.version,p_sale_id:input.sale_id};
   }else if(input.operation==='checkpoint'){
    if(Object.keys(input).some(k=>!['operation','project_id','version','event_id','manifest'].includes(k))||typeof input.event_id!=='string'||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(input.event_id))return reply({error:'Invalid input'},400);
    let checked;try{checked=manifest(input.manifest);}catch{return reply({error:'Invalid manifest'},400);}
    operation='os_save_creative_checkpoint';args={p_project_id:input.project_id,p_version:input.version,p_event_id:input.event_id,p_manifest:checked};
   }else return reply({error:'Invalid operation'},400);
  }
  const {data,error}=await owner.supabase.rpc(operation,args);
  if(error)return reply({error:['40001','22023','23505'].includes(error.code)?'Conflict or invalid reference':error.code==='42501'?'Forbidden':'Storage unavailable'},error.code==='42501'?403:['40001','22023','23505'].includes(error.code)?409:503);
  return reply({receipt:data,publication:'NOT_PERFORMED'});
 }catch{return reply({error:'Storage unavailable'},503);}
}
