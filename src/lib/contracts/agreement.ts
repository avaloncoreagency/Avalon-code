import master from "./master.json";

export type AgreementData = {
  agencyName: string;
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

export const SERVICE_OPTIONS = [
  "Website", "E-commerce", "CRM implementation", "Marketing / Ads",
  "SEO / Google Business", "AI Receptionist", "AI Chatbot", "Lead Generation",
  "Automation", "Other",
] as const;

export const AGREEMENT_VERSION = master.version;
export const AGREEMENT_CLAUSES = master.clauses;

export function validateAgreement(input: AgreementData): string[] {
  const required: (keyof AgreementData)[] = [
    "agencyName", "agencyAddress", "agencyEmail", "clientName", "clientAddress",
    "clientEmail", "county", "effectiveDate", "scope", "deliverables",
    "milestones", "acceptance", "revisions", "term", "paymentSchedule",
    "adSpend", "commission",
  ];
  const errors = required.filter(k => !String(input[k]).trim()).map(k => String(k));
  if (!input.services.length || input.services.some(s => !SERVICE_OPTIONS.includes(s as typeof SERVICE_OPTIONS[number])))
    errors.push("services");
  for (const k of ["agencyEmail", "clientEmail"] as const) {
    if (input[k] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input[k])) errors.push(k);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) || Number.isNaN(Date.parse(input.effectiveDate)))
    errors.push("effectiveDate");
  for (const k of ["setupFee", "monthlyFee"] as const) {
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(input[k]) || Number(input[k]) < 0) errors.push(k);
  }
  for (const [k,v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > (["scope","deliverables","exclusions","specialTerms"].includes(k) ? 3000 : 800))
      errors.push(k);
  }
  return [...new Set(errors)];
}

export function agreementLines(data: AgreementData, id: string): { heading: string; text: string }[] {
  return [
    { heading: "MASTER SERVICES AGREEMENT", text: "AVALON CORE AGENCY | ATTORNEY REVIEW DRAFT | "+AGREEMENT_VERSION },
    { heading: "Agreement "+id.toUpperCase(), text: "Effective: "+data.effectiveDate+" | Florida, "+data.county+" County. This is an unsigned draft, not an executed agreement." },
    { heading: "AGENCY", text: [data.agencyName,data.agencyAddress,data.agencyEmail].join(" | ") },
    { heading: "CLIENT", text: [data.clientName,data.clientAddress,data.clientEmail].join(" | ") },
    ...AGREEMENT_CLAUSES.map(c => ({heading:c[0],text:c[1]})),
    { heading:"EXHIBIT A / STATEMENT OF WORK", text:"This SOW must be expressly approved and signed by both authorized parties. Nothing is activated by merely generating this PDF." },
    { heading:"Services", text:data.services.join(", ") },
    { heading:"Scope", text:data.scope },
    { heading:"Exclusions", text:data.exclusions || "None stated; only expressly included work is authorized." },
    { heading:"Deliverables", text:data.deliverables },
    { heading:"Milestones and dependencies", text:data.milestones },
    { heading:"Acceptance criteria", text:data.acceptance },
    { heading:"Included revisions", text:data.revisions },
    { heading:"Term and renewals", text:data.term },
    { heading:"Fees", text:"Setup: USD "+data.setupFee+" | Recurring per month: USD "+data.monthlyFee },
    { heading:"Payment schedule", text:data.paymentSchedule },
    { heading:"Third-party and advertising spend", text:data.adSpend },
    { heading:"Commission (if applicable)", text:data.commission },
    { heading:"Additional negotiated terms", text:data.specialTerms || "None." },
    { heading:"AUTHORIZED SIGNATURES", text:"Agency signatory: ____________________ Title: __________ Date: __________" },
    { heading:"", text:"Client signatory: _____________________ Title: __________ Date: __________" },
    { heading:"IMPORTANT", text:"DRAFT / NOT SIGNED. A PDF download is not an electronic signature. This form requires review by qualified Florida counsel before client use." },
  ];
}
