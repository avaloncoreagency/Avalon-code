"use server";
import { revalidatePath } from "next/cache";
import { ownerForAction } from "@/lib/os/actions";
import { getLang } from "@/lib/i18n-server";
import { coreEngineMessage } from "@/lib/sales/core-engine";
import { runSaleOperation, saveCatalogOffer } from "@/lib/sales/core-engine-server";
import { UUID_RE } from "@/components/sales/ui";
import type { CoreFeedback } from "@/components/sales/core-form";

export async function operateSale(saleId: string, operation: string, form: FormData): Promise<CoreFeedback> {
  const {supabase} = await ownerForAction();
  const lang = await getLang();
  if (!UUID_RE.test(saleId)) return {ok:false,message:coreEngineMessage(null,lang)};
  const input = Object.fromEntries([...form.entries()].filter(([key,value])=>!key.startsWith("$") && typeof value === "string"));
  const result = await runSaleOperation(supabase,saleId,operation,input);
  if (!result.ok) return {ok:false,message:coreEngineMessage({message:result.message},lang)};
  for (const path of ["/admin/workspace/crm/sales","/admin/workspace/crm/clients",`/admin/workspace/crm/sales/${saleId}`]) revalidatePath(path,"layout");
  return {ok:true,message:lang === "es" ? "Operación confirmada por el servidor." : "Operation confirmed by the server."};
}

export async function editCatalogOffer(id: string, version: number, approve: boolean, form: FormData): Promise<CoreFeedback> {
  const {supabase} = await ownerForAction(); const lang = await getLang();
  if (!UUID_RE.test(id) || !Number.isSafeInteger(version)) return {ok:false,message:coreEngineMessage(null,lang)};
  const result = await saveCatalogOffer(supabase,id,version,Object.fromEntries(form),approve);
  if (!result.ok) return {ok:false,message:coreEngineMessage({message:result.message},lang)};
  revalidatePath("/admin/workspace/crm/settings"); revalidatePath("/admin/workspace/crm/sales/new");
  return {ok:true,message:lang === "es" ? "Oferta actualizada por el servidor." : "Offer updated by the server."};
}
