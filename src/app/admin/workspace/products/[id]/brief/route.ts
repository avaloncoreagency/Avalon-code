import { NextRequest, NextResponse } from 'next/server';
import { getOwnerSession } from '@/lib/auth/session';
import { changeBrief, isService, readProductState, validId } from '@/lib/os/client-hud';
import { secretFindings } from '@/lib/project-bridge/policy';
export const dynamic = 'force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const session=await getOwnerSession();
  if(!session)return new NextResponse('Unauthorized',{status:401,headers});
  const {id}=await params;
  const requestId=request.nextUrl.searchParams.get('request');
  if(!validId(id)||!validId(requestId))return new NextResponse('Not found',{status:404,headers});
  const {data:p,error}=await session.supabase.from('os_projects').select('id,module,name,description,settings,client_id,version').eq('id',id).maybeSingle();
  if(error)return new NextResponse('Unavailable',{status:503,headers});
  if(!p||!isService(p.module))return new NextResponse('Not found',{status:404,headers});
  try {
    const change=readProductState(p.settings.client_hud).requests.find(r=>r.id===requestId);
    if(!change)return new NextResponse('Not found',{status:404,headers});
    const reference=(value:unknown)=>{try{const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password)return '';u.search='';u.hash='';return u.href;}catch{return '';}};
    const report=changeBrief({...p,module:p.module,reportContext:{client_id:p.client_id??null,record_version:p.version,url:reference(p.settings.operations?.url),repository:reference(p.settings.operations?.repository)}},change);
    if(secretFindings(report).length)return new NextResponse('Possible secret in the record. Review before exporting.',{status:409,headers});
    return new NextResponse(report,{headers:{...headers,'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="avalon-request-${requestId}.md"`}});
  }catch{return new NextResponse('Invalid saved state',{status:409,headers});}
}
