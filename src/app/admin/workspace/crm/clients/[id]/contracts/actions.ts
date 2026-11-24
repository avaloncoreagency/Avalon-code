"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { back, ownerForAction, uuidField } from "@/lib/os/actions";
import { canonicalSnapshot, makeAgreementSnapshot, validateAgreement, type AgreementData } from "@/lib/contracts/agreement";
import { DEFAULT_MASTER_VERSION, masterVersion } from "@/lib/contracts/versions";

const BASE = "/admin/workspace/crm/clients";
const PROPS: (keyof AgreementData)[] = [
  "agencyLegalForm", "agencyName", "agencyBrand", "agencyAddress", "agencyEmail", "clientAddress", "clientEmail",
  "county", "effectiveDate", "scope", "exclusions", "deliverables", "milestones",
  "acceptance", "revisions", "term", "setupFee", "monthlyFee", "paymentSchedule",
  "adSpend", "commission", "specialTerms", "supportMaintenance", "warrantyPeriod",
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
  if (input.agencyLegalForm === "registered_entity" && form.get("entityExistsConfirm") !== "yes") errors.push("entityExistsConfirm");
  if (errors.length) back(here, { error: "fields" });
  const quoteVersionId = uuidField(form, "quote_version_id");
  // Owner-selected master version (registry only; retired or unknown versions are refused).
  const version = String(form.get("template_version") ?? DEFAULT_MASTER_VERSION);
  const master = masterVersion(version);
  if (!master || master.status === "retired") back(here, { error: "fields" });
  const snapshot = makeAgreementSnapshot(input, master.version);
  const digest = createHash("sha256").update(canonicalSnapshot(snapshot)).digest("hex");
  const { data, error } = await supabase.from("crm_client_agreement_drafts")
    .insert({client_id:clientId,template_version:master.version,
      snapshot,snapshot_sha256:digest,created_by:userId,status:"draft",
      ...(quoteVersionId ? { quote_version_id: quoteVersionId } : {})})
    .select("id").single();
  if (error?.code === "23505") {
    // A double-tap or network retry must not create a second indistinguishable draft.
    const already = await supabase.from("crm_client_agreement_drafts")
      .select("id").eq("client_id", clientId).eq("snapshot_sha256", digest).maybeSingle();
    if (already.data?.id) back(here, { ok: "existing", agreement: already.data.id });
  }
  // The database trigger re-checks that the quote revision is accepted and belongs to this same company.
  if (error?.message?.includes("agreement_quote_not_accepted")) back(here, { error: "quote" });
  if (error || !data) back(here, { error: error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST204" ? "schema" : "save" });
  revalidatePath(here);
  back(here, { ok: "created", agreement: data.id });
}
