import { NextRequest, NextResponse } from 'next/server';
import { getOwnerSession } from '@/lib/auth/session';
import { changeBrief, isService, readProductState, validId } from '@/lib/os/client-hud';
export const dynamic = 'force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const session=await getOwnerSession();
  if(!session)return new NextResponse('Unauthorized',{status:401,headers});
  const {id}=await params;
  const requestId=request.nextUrl.searchParams.get('request');
  if(!validId(id)||!validId(requestId))return new NextResponse('Not found',{status:404,headers});
  const {data:p,error}=await session.supabase.from('os_projects').select('id,module,name,description,settings').eq('id',id).maybeSingle();
  if(error)return new NextResponse('Unavailable',{status:503,headers});
  if(!p||!isService(p.module))return new NextResponse('Not found',{status:404,headers});
  try {
    const change=readProductState(p.settings.client_hud).requests.find(r=>r.id===requestId);
    if(!change)return new NextResponse('Not found',{status:404,headers});
    return new NextResponse(changeBrief({...p,module:p.module},change),{headers:{...headers,'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="avalon-request-${requestId}.md"`}});
  }catch{return new NextResponse('Invalid saved state',{status:409,headers});}
}
