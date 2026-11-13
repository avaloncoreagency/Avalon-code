"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { CATEGORIES, bridgeCategoryEnabled, type Category } from "@/lib/project-bridge/policy";
import { isService, SERVICES } from "@/lib/os/client-hud";

const destination=(module:Category)=>isService(module)?`/admin/workspace/${SERVICES[module].slug}`:"/admin/dashboard";

/** Owner-only review gate: an API delivery can be attached to an existing product before processImport. */
export async function assignPendingImport(form: FormData) {
  const { supabase } = await ownerForAction();
  const importId=uuidField(form,"import_id");
  const projectId=uuidField(form,"project_id");
  const category=field(form,"category") as Category;
  if (!CATEGORIES.includes(category) || !importId || !projectId) back("/admin/dashboard",{error:"invalid"});
  const target=destination(category);
  if (!bridgeCategoryEnabled(category, process.env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS === "true"))
    back(target,{error:"category_not_enabled"});
  const [imp,product]=await Promise.all([
    supabase.from("os_project_imports").select("id,category,status,project_id").eq("id",importId).maybeSingle(),
    supabase.from("os_projects").select("id,module,status").eq("id",projectId).maybeSingle(),
  ]);
  if (imp.error || product.error) back(target,{error:"unavailable"});
  if (!imp.data || !product.data || imp.data.category!==category || product.data.module!==category ||
    product.data.status==="archived" || !["received","failed"].includes(imp.data.status) || imp.data.project_id)
    back(target,{error:"conflict"});
  const updated=await supabase.from("os_project_imports").update({project_id:projectId})
    .eq("id",importId).eq("category",category).is("project_id",null)
    .in("status",["received","failed"]).select("id").maybeSingle();
  if (updated.error) back(target,{error:"unavailable"});
  if (!updated.data) back(target,{error:"conflict"});
  revalidatePath(target);
  revalidatePath(`/admin/workspace/products/${projectId}`);
  back(target+"#deliveries-"+category,{ok:"saved"});
}
