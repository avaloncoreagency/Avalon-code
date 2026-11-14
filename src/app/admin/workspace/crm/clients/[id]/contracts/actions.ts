"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { back, ownerForAction, uuidField } from "@/lib/os/actions";
import { AGREEMENT_VERSION, validateAgreement, type AgreementData } from "@/lib/contracts/agreement";

const BASE = "/admin/workspace/crm/clients";
const PROPS: (keyof AgreementData)[] = [
  "agencyName", "agencyAddress", "agencyEmail", "clientAddress", "clientEmail",
  "county", "effectiveDate", "scope", "exclusions", "deliverables", "milestones",
  "acceptance", "revisions", "term", "setupFee", "monthlyFee", "paymentSchedule",
  "adSpend", "commission", "specialTerms",
];

export async function createClientAgreement(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  if (!clientId) back(BASE, { error: "invalid" });
  const here = BASE + "/" + clientId + "/contracts";
  const { data: client, error: clientError } = await supabase.from("crm_clients")
    .select("id,legal_name").eq("id", clientId).maybeSingle();
  if (clientError || !client) back(here, { error: "client" });
  const values = Object.fromEntries(PROPS.map(k => [k, String(form.get(k) ?? "").trim()]));
  const input = { ...values, clientName: client.legal_name,
    services: form.getAll("services").map(String),
  } as AgreementData;
  const errors = validateAgreement(input);
  if (errors.length) back(here, { error: "fields" });
  const canonical = JSON.stringify(input);
  const digest = createHash("sha256").update(AGREEMENT_VERSION + "\n" + canonical).digest("hex");
  const { data, error } = await supabase.from("crm_client_agreement_drafts")
    .insert({client_id:clientId,template_version:AGREEMENT_VERSION,
      snapshot:input,snapshot_sha256:digest,created_by:userId,status:"draft"})
    .select("id").single();
  if (error || !data) back(here, { error: error?.code === "42P01" || error?.code === "PGRST205" ? "schema" : "save" });
  revalidatePath(here);
  back(here, { ok: "created", agreement: data.id });
}
