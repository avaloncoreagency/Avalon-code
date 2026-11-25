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
  "paymentModel", "clientResponsibilities", "cancellationTerms",
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
  // Owner-selected master version (registry only; retired, unknown or review-only versions are refused).
  const version = String(form.get("template_version") ?? DEFAULT_MASTER_VERSION);
  const master = masterVersion(version);
  // A version pending attorney review is never offered as a contract: only versions available for new drafts.
  if (!master || master.status === "retired" || !master.availableForNewDrafts) back(here, { error: "fields" });
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

/**
 * Contract Studio: tie the signature record (crm_contracts on the client's origin lead, where signature evidence is
 * recorded and verified) to the EXACT agreement snapshot sent for signature, by id + sha256. Linking does not sign
 * anything and never changes the contract status; the database refuses a foreign client, a hash mismatch, a late link
 * (already signed) or re-linking (migration 20261124200000).
 */
export async function linkAgreementToContract(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id"), agreementId = uuidField(form, "agreement_id"), contractId = uuidField(form, "contract_id");
  if (!clientId || !agreementId || !contractId) back(BASE, { error: "invalid" });
  const here = BASE + "/" + clientId + "/contracts";
  const draft = await supabase.from("crm_client_agreement_drafts").select("id,client_id,snapshot_sha256").eq("id", agreementId!).maybeSingle();
  const d = draft.data as { id: string; client_id: string; snapshot_sha256: string } | null;
  if (!d || d.client_id !== clientId) back(here, { error: "link_invalid", agreement: agreementId! });
  const r = await supabase.from("crm_contracts").update({ agreement_draft_id: d!.id, agreement_sha256: d!.snapshot_sha256 })
    .eq("id", contractId!).is("agreement_draft_id", null);
  if (r.error) {
    const m = /contract_agreement_[a-z_]+/.exec(r.error.message ?? "")?.[0];
    back(here, { error: m ?? (/agreement_draft_id/.test(r.error.message ?? "") ? "link_pending" : "link_invalid"), agreement: agreementId! });
  }
  // Read back: RLS or a concurrent link can turn the update into a no-op without an error.
  const check = await supabase.from("crm_contracts").select("agreement_draft_id").eq("id", contractId!).maybeSingle();
  if ((check.data as { agreement_draft_id: string | null } | null)?.agreement_draft_id !== d!.id) back(here, { error: "link_invalid", agreement: agreementId! });
  revalidatePath(here);
  back(here, { ok: "linked", agreement: agreementId! });
}
