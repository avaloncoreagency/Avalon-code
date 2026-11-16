"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, back, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { checkClientProjectLink } from "@/lib/crm/client-project-link";
import { isService, SERVICES } from "@/lib/os/client-hud";

const BASE = "/admin/workspace/crm/clients";

/**
 * Explicitly attach an existing, unassigned external product to one confirmed client.
 * The FK, trigger-based project audit and version CAS are the source of truth.
 * No sale, payment, AI request or duplicate project is created.
 */
export async function linkExistingProject(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  const projectId = uuidField(form, "project_id");
  if (!clientId || !projectId) back(BASE, { error: "invalid" });
  const path = `${BASE}/${clientId}`;

  const [client, project] = await Promise.all([
    supabase.from("crm_clients").select("id,status,origin_lead_id").eq("id", clientId).maybeSingle(),
    supabase.from("os_projects").select("id,client_id,status,settings,version,module").eq("id", projectId).maybeSingle(),
  ]);
  if (client.error || project.error) back(path, { error: mapDbError(client.error ?? project.error) });
  if (!client.data || !project.data || !isService(project.data.module)) back(path, { error: "not_found" });

  const decision = checkClientProjectLink(client.data, project.data);
  if (decision === "already_linked") back(path, { ok: "saved" });
  if (decision !== "ok") back(path, { error: "conflict" });

  // A project from another client's sale/tasks must never be attached to this client,
  // even if its direct client FK was left unassigned.
  const [otherOrders, otherTasks] = await Promise.all([
    supabase.from("crm_work_orders").select("id").eq("project_id", projectId).neq("client_id", clientId).limit(1),
    supabase.from("crm_tasks").select("id").eq("project_id", projectId)
      .not("client_id", "is", null).neq("client_id", clientId).limit(1),
  ]);
  if (otherOrders.error || otherTasks.error) back(path, { error: mapDbError(otherOrders.error ?? otherTasks.error) });
  if (otherOrders.data?.length || otherTasks.data?.length) back(path, { error: "conflict" });

  // The version guard prevents simultaneous edits or another owner linking this product elsewhere.
  const { data, error } = await supabase.from("os_projects").update({ client_id: clientId })
    .eq("id", projectId).is("client_id", null).eq("version", project.data.version)
    .select("id").maybeSingle();
  if (error) back(path, { error: mapDbError(error) });
  if (!data) back(path, { error: "conflict" });

  revalidatePath(path);
  revalidatePath(`/admin/workspace/products/${projectId}`);
  revalidatePath(`/admin/workspace/${SERVICES[project.data.module].slug}`);
  back(path, { ok: "saved" });
}
