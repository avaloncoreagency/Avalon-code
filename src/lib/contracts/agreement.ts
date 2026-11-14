import master from "./master.json";

/** Only the real contracting person(s) or an actually formed legal entity may be named as Agency. */
export type AgencyLegalForm = "individual" | "joint_individuals" | "registered_entity";

export type AgreementData = {
  agencyLegalForm: AgencyLegalForm;
  agencyName: string;
  agencyBrand: string;
  agencyAddress: string;
  agencyEmail: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  county: string;
  effectiveDate: string;
  services: string[];
  scope: string;
  exclusions: string;
  deliverables: string;
  milestones: string;
  acceptance: string;
  revisions: string;
  term: string;
  setupFee: string;
  monthlyFee: string;
  paymentSchedule: string;
  adSpend: string;
  commission: string;
  specialTerms: string;
};

export type AgreementSnapshot = {
  schemaVersion: 1;
  templateVersion: string;
  data: AgreementData;
  /** Frozen clause text: re-rendering an old draft must not silently change its legal terms. */
  clauses: [string, string][];
};

export const SERVICE_OPTIONS = [
  "Website", "E-commerce", "CRM implementation", "Marketing / Ads",
  "SEO / Google Business", "AI Receptionist", "AI Chatbot", "Lead Generation",
  "Automation", "Other",
] as const;

export const AGREEMENT_VERSION = master.version;
export const AGREEMENT_CLAUSES: [string, string][] = master.clauses.map(c => [c[0], c[1]]);
export const LEGAL_FORMS: AgencyLegalForm[] = ["individual", "joint_individuals", "registered_entity"];

const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const email = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const usd = (value: string) => /^\d{1,9}(\.\d{1,2})?$/.test(value) && Number(value) >= 0;

export function validateAgreement(input: AgreementData): string[] {
  const required: (keyof AgreementData)[] = [
    "agencyName", "agencyAddress", "agencyEmail", "clientName", "clientAddress",
    "clientEmail", "county", "effectiveDate", "scope", "deliverables",
    "milestones", "acceptance", "revisions", "term", "paymentSchedule",
    "adSpend", "commission",
  ];
  const errors = required.filter(k => !nonempty(input[k])).map(String);
  if (!LEGAL_FORMS.includes(input.agencyLegalForm)) errors.push("agencyLegalForm");
  if (!Array.isArray(input.services) || !input.services.length ||
    input.services.some(s => !SERVICE_OPTIONS.includes(s as typeof SERVICE_OPTIONS[number])) ||
    new Set(input.services).size !== input.services.length) errors.push("services");
  for (const k of ["agencyEmail", "clientEmail"] as const) {
    if (nonempty(input[k]) && !email(input[k])) errors.push(k);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) ||
    Number.isNaN(Date.parse(input.effectiveDate)) ||
    new Date(input.effectiveDate).toISOString().slice(0, 10) !== input.effectiveDate)
    errors.push("effectiveDate");
  for (const k of ["setupFee", "monthlyFee"] as const) if (!usd(input[k])) errors.push(k);

  // "Avalon Core Agency" is a project/brand name, not a formed LLC or a substitute for a legal signer.
  const normalized = input.agencyName.toLowerCase().replace(/[.,\s]/g, "");
  if (normalized === "avaloncoreagency" || normalized === "avaloncoreagencyllc") errors.push("agencyName");
  if (input.agencyLegalForm !== "registered_entity" &&
    /\b(?:llc|l\.l\.c\.|inc\.?|corp\.?|corporation)\b/i.test(input.agencyName)) errors.push("agencyName");
  if (!/^[a-zA-Z][a-zA-Z\s.'-]{1,79}$/.test(input.county)) errors.push("county");

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    const max = ["scope", "deliverables", "exclusions", "specialTerms"].includes(key) ? 3000 : 800;
    if (value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) errors.push(key);
  }
  if (input.agencyBrand?.length > 120) errors.push("agencyBrand");
  return [...new Set(errors)];
}

/** Recursively sorted JSON survives Postgres jsonb key reordering. */
export function canonicalSnapshot(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalSnapshot).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map(k =>
    JSON.stringify(k) + ":" + canonicalSnapshot(record[k])).join(",") + "}";
}

export function makeAgreementSnapshot(data: AgreementData): AgreementSnapshot {
  return {
    schemaVersion: 1, templateVersion: AGREEMENT_VERSION, data,
    clauses: AGREEMENT_CLAUSES.map(([heading, body]) => [heading, body]),
  };
}

export function isAgreementSnapshot(v: unknown): v is AgreementSnapshot {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as Partial<AgreementSnapshot>;
  if (s.schemaVersion !== 1 || typeof s.templateVersion !== "string" ||
    !s.data || !Array.isArray(s.clauses) || s.clauses.length < 10 ||
    s.clauses.length > 60 || s.clauses.some(c => !Array.isArray(c) || c.length !== 2 ||
    typeof c[0] !== "string" || typeof c[1] !== "string" || c[1].length > 10000))
    return false;
  return validateAgreement(s.data as AgreementData).length === 0;
}

export function agreementLines(snapshot: AgreementSnapshot, id: string): { heading: string; text: string }[] {
  const data = snapshot.data;
  const legalForm = {
    individual: "Individual service provider (no separate incorporated entity)",
    joint_individuals: "Individual co-providers (no separate incorporated entity)",
    registered_entity: "Registered legal entity (identity and standing to be verified)",
  }[data.agencyLegalForm];
  const brand = data.agencyBrand.trim()
    ? " | Brand or project name: " + data.agencyBrand +
      ". Branding does not itself establish registration or separate legal status."
    : "";
  const signatureAgency = data.agencyLegalForm === "joint_individuals"
    ? [
        { heading: "Agency representative 1", text: "Legal name: __________________________ Signature: _______________________ Date: __________" },
        { heading: "Agency representative 2", text: "Legal name: __________________________ Signature: _______________________ Date: __________" },
      ]
    : [{ heading: "Agency authorized signatory", text: "Legal name: __________________________ Title: __________________________ Signature: _______________________ Date: __________" }];
  return [
    { heading: "MASTER SERVICES AGREEMENT", text: "AVALON CORE AGENCY | ATTORNEY REVIEW DRAFT | " + snapshot.templateVersion },
    { heading: "Agreement " + id.toUpperCase(), text: "Proposed effective date: " + data.effectiveDate + " | " + data.county + " County, Florida. Unsigned draft; date is not evidence of execution." },
    { heading: "AGENCY / LEGAL CONTRACTING PARTY", text: data.agencyName + " | " + legalForm + brand + " | Address: " + data.agencyAddress + " | Notices: " + data.agencyEmail },
    { heading: "CLIENT / LEGAL CONTRACTING PARTY", text: data.clientName + " | Address: " + data.clientAddress + " | Notices: " + data.clientEmail },
    ...snapshot.clauses.map(([heading, text]) => ({ heading, text })),
    { heading: "EXHIBIT A / STATEMENT OF WORK", text: "This statement of work is part of this draft and must be approved and signed with the Master Services Agreement. Generating this PDF does not activate services or authorize spending." },
    { heading: "Services", text: data.services.join(", ") },
    { heading: "Scope", text: data.scope },
    { heading: "Exclusions", text: data.exclusions || "Only expressly included work is authorized." },
    { heading: "Deliverables", text: data.deliverables },
    { heading: "Milestones and client dependencies", text: data.milestones },
    { heading: "Acceptance criteria", text: data.acceptance },
    { heading: "Included revisions", text: data.revisions },
    { heading: "Term and renewal terms", text: data.term },
    { heading: "Fees", text: "One-time setup: USD " + data.setupFee + " | Recurring per month: USD " + data.monthlyFee },
    { heading: "Payment schedule", text: data.paymentSchedule },
    { heading: "Third-party and advertising spend", text: data.adSpend },
    { heading: "Commission, if any", text: data.commission },
    { heading: "Additional negotiated terms", text: data.specialTerms || "None." },
    { heading: "AUTHORIZED SIGNATURES", text: "Both parties must sign an approved final document; these are not electronic signatures." },
    ...signatureAgency,
    { heading: "Client authorized signatory", text: "Legal name: __________________________ Title: __________________________ Signature: _______________________ Date: __________" },
    { heading: "IMPORTANT", text: "ATTORNEY REVIEW REQUIRED / NOT SIGNED / NOT FOR CLIENT EXECUTION. A draft PDF is neither a signature nor permission to mark a CRM contract as verified." },
  ];
}
