"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { InvalidPlan, parseSolutionPlanForm } from "@/lib/service-factory/planner";

const ROOT = "/admin/service-factory/planner";
function codeFor(error: {message?: string; code?: string} | null) {
  const message = error?.message ?? "";
  const codes = ["planner_forbidden", "planner_invalid", "planner_invalid_key",
    "planner_invalid_currency", "planner_invalid_text", "planner_client_missing",
    "planner_invalid_amount", "planner_invalid_lines", "planner_invalid_line",
    "planner_service_missing", "planner_invalid_quantity", "planner_invalid_price",
    "planner_not_ready", "planner_not_found", "planner_conflict", "planner_empty"];
  const found = codes.find(x => message.includes(x));
  if (found) return found;
  return error?.code === "42P01" || error?.code === "42883" || error?.code === "42703"
    ? "schema_pending" : "unavailable";
}

/** One atomic SQL RPC creates a draft plus canonical SKU-linked price snapshots. */
export async function createSolutionPlan(form: FormData) {
  const {supabase} = await ownerForAction();
  let request;
  try { request = parseSolutionPlanForm(form); }
  catch (e) { back(ROOT, {error: e instanceof InvalidPlan ? e.code : "invalid"}); }
  const {data, error} = await supabase.rpc("crm_create_solution_plan", {request});
  if (error || typeof data !== "string" || !/^[0-9a-f-]{36}$/i.test(data))
    back(ROOT, {error: codeFor(error)});
  revalidatePath(ROOT);
  revalidatePath("/admin/service-factory");
  back(`${ROOT}/${data}`, {ok: "created"});
}

/** Internal review does NOT create a sale, invoice, external proposal or message. */
export async function reviewSolutionPlan(form: FormData) {
  const {supabase} = await ownerForAction();
  const planId = uuidField(form, "plan_id");
  const versionString = field(form, "version");
  if (!planId || !/^[1-9][0-9]{0,8}$/.test(versionString))
    back(ROOT, {error:"invalid"});
  const path = `${ROOT}/${planId}`;
  const {data, error} = await supabase.rpc("crm_review_solution_plan",
    {plan_id:planId, expected_version:Number(versionString)});
  if (error || data !== true) back(path, {error:codeFor(error)});
  revalidatePath(path);
  revalidatePath(ROOT);
  back(path, {ok:"reviewed"});
}
