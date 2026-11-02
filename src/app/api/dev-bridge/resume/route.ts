import { getAuthorizedMember } from '@/lib/auth/access';
import { packageFor } from '@/lib/dev-bridge/runtime';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!await getAuthorizedMember()) return Response.json({error:'Unauthorized'}, {status:401, headers});
  const params = new URL(request.url).searchParams;
  const issue = Number(params.get('issue')), owner = params.get('as');
  if (!Number.isSafeInteger(issue) || issue < 1 || (owner !== 'miguel' && owner !== 'samuel')) return Response.json({error:'Invalid issue or owner'}, {status:400, headers});
  try {
    const pkg = await packageFor(issue, owner);
    return Response.json(pkg, {headers:{...headers, 'Content-Disposition':`attachment; filename="avalon-${issue}-${owner}.json"`}});
  } catch {
    return Response.json({error:'Paquete no disponible. Comprueba GitHub, la Issue y su PR; espera diez segundos antes de repetir.'}, {status:409, headers});
  }
}
