import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getOwnerSession } from "@/lib/auth/session";
import { renderAgreementPdf } from "@/lib/contracts/pdf";
import { AGREEMENT_VERSION, canonicalAgreement, type AgreementData } from "@/lib/contracts/agreement";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{id:string; agreementId:string}> }) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({error:"Unauthorized"},{status:403});
  const {id,agreementId} = await params;
  if(!UUID.test(id) || !UUID.test(agreementId))
    return NextResponse.json({error:"Invalid agreement"},{status:400});
  const {data,error} = await session.supabase.from("crm_client_agreement_drafts")
    .select("id,client_id,template_version,snapshot,snapshot_sha256,status")
    .eq("id",agreementId).eq("client_id",id).maybeSingle();
  if(error || !data || data.status!=="draft")
    return NextResponse.json({error:"Agreement not available"},{status:404});
  if (data.template_version !== AGREEMENT_VERSION)
    return NextResponse.json({error:"Archived template unavailable; original version must be restored"},{status:409});
  const digest = createHash("sha256")
    .update(data.template_version + "\\n" + canonicalAgreement(data.snapshot as AgreementData))
    .digest("hex");
  if (digest !== data.snapshot_sha256)
    return NextResponse.json({error:"Agreement integrity check failed"},{status:409});
  const bytes = renderAgreementPdf(data.snapshot as AgreementData, data.id);
  return new NextResponse(new Uint8Array(bytes), {
    headers:{
      "Content-Type":"application/pdf",
      "Content-Disposition":'attachment; filename="Avalon-Agreement-'+agreementId+'.pdf"',
      "Content-Length":String(bytes.length),
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
      "Content-Security-Policy":"default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy":"same-origin",
    }
  });
}
