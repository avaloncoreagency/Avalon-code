"use server";

import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { getCrmCapabilities } from "@/lib/sales/client-finance-server";
import { isAttributionState } from "@/lib/sales/attribution";

const BASE = "/admin/workspace/crm/clients";
const validMoney = (x:string) => /^\d{1,12}(\.\d{1,2})?$/.test(x) && Number(x) > 0;
const validExcluded = (x:string) => /^\d{1,12}(\.\d{1,2})?$/.test(x) && Number(x) >= 0;

export async function recordAttribution(form:FormData) {
  const {supabase} = await ownerForAction();
  const id = uuidField(form,"client_id");
  if (!id) back(BASE,{error:"invalid"});
  const path = BASE+"/"+id+"/results";
  const caps = await getCrmCapabilities(supabase);
  if (!caps.owner || !caps.financeView || caps.source!=="database") back(path,{error:"finance_denied"});
  const source = field(form,"source").trim();
  const external_ref = field(form,"external_ref").trim();
  const gross_collected = field(form,"gross_collected").trim();
  const excluded_amount = field(form,"excluded_amount").trim() || "0";
  if (source.length < 3 || source.length > 120 || external_ref.length < 3 ||
      external_ref.length > 160 || !validMoney(gross_collected) ||
      !validExcluded(excluded_amount) || Number(excluded_amount)>=Number(gross_collected))
    back(path,{error:"invalid"});
  const {error} = await supabase.rpc("crm_attribution_record",{
    request:{client_id:id,source,external_ref,gross_collected,excluded_amount},
  });
  if (error) back(path,{error:error.code==="23505"?"duplicate":error.code==="42501"?"finance_denied":"cannot_record"});
  revalidatePath(path);
  revalidatePath(BASE+"/"+id);
  back(path,{ok:"recorded"});
}

export async function transitionAttribution(form:FormData) {
  const {supabase} = await ownerForAction();
  const client = uuidField(form,"client_id"), conversion = uuidField(form,"conversion_id");
  if (!client || !conversion) back(BASE,{error:"invalid"});
  const path = BASE+"/"+client+"/results";
  const caps = await getCrmCapabilities(supabase);
  if (!caps.owner || !caps.financeView || caps.source!=="database") back(path,{error:"finance_denied"});
  const target = field(form,"target");
  const evidence = field(form,"evidence").trim();
  const version = Number(field(form,"version"));
  const strict = target==="void" || target==="disputed";
  if (!isAttributionState(target) || target==="reported" || evidence.length < (strict?5:3) ||
      evidence.length > 250 || !Number.isInteger(version) || version < 1) back(path,{error:"invalid"});
  // Verify client membership of conversion before changing its state: no cross-client POST.
  const row = await supabase.from("crm_attributed_conversions").select("id")
    .eq("id",conversion).eq("client_id",client).maybeSingle();
  if (row.error || !row.data) back(path,{error:"not_found"});
  // Lifecycle RPC (20261121181000): every step needs evidence and the version the owner saw.
  const {error} = await supabase.rpc("crm_attribution_advance",{
    p_conversion:conversion,p_to:target,p_evidence:evidence,p_expected_version:version,
  });
  if (error) back(path,{error:/version_conflict/.test(error.message ?? "")?"conflict":
    error.code==="PGRST202"||error.code==="42883"?"schema_pending":"transition_rejected"});
  revalidatePath(path);
  revalidatePath(BASE+"/"+client);
  back(path,{ok:target});
}
