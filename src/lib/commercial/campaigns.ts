/** Internal campaign briefs only. Never creates or publishes an ad. */
export type Brief = {
 id:string;audience:"agency_b2b"|"contractor_b2c";
 es:{headline:string;body:string;cta:string};
 en:{headline:string;body:string;cta:string};
 target:string;privacyWarning:string;
};
export const CAMPAIGN_BRIEFS: readonly Brief[]=[
 {id:"avalon-business-review",audience:"agency_b2b",
 es:{headline:"Organiza tus oportunidades comerciales",body:"¿Recibes consultas sin un proceso de seguimiento claro? Avalon puede ayudarte a revisar tus páginas, CRM y atención digital.",cta:"Solicitar diagnóstico"},
 en:{headline:"Organize your incoming business opportunities",body:"Getting inquiries without a clear follow-up process? Avalon can review your website, CRM and digital intake.",cta:"Request a review"},
 target:"Existing B2B funnel / CRM",privacyWarning:"Capture requires appropriate consent; request is not a sale."},
 {id:"hvac-replacement-review",audience:"contractor_b2c",
 es:{headline:"Solicita una evaluación para reemplazar tu aire",body:"Conoce las opciones que ofrece [CONTRATISTA VERIFICADO] para viviendas en [ZONA APROBADA].",cta:"Solicitar evaluación"},
 en:{headline:"Request an AC replacement evaluation",body:"Ask [VERIFIED CONTRACTOR] about options for homes in [APPROVED AREA].",cta:"Request evaluation"},
 target:"Future isolated B2C Lead Router - NOT CONNECTED",
 privacyWarning:"Must identify contractor and applicable license; no live routing or advertising."}
];
export type CampaignReadiness={
 audience:"agency_b2b"|"contractor_b2c";approvedCopy:boolean;
 consentReviewed:boolean;budgetApproved:boolean;destinationVerified:boolean;
 contractorLicenseVerified:boolean;legalReview:boolean;isolatedB2CBackend:boolean;
};
export function reviewCampaign(input:CampaignReadiness):{status:"review_only"|"blocked";reasons:string[]}{
 const reasons:string[]=[];
 if(!input.approvedCopy)reasons.push("copy_pending");
 if(!input.consentReviewed)reasons.push("consent_pending");
 if(!input.budgetApproved)reasons.push("budget_pending");
 if(!input.destinationVerified)reasons.push("destination_pending");
 if(!input.legalReview)reasons.push("legal_review_pending");
 if(input.audience==="contractor_b2c"){
  if(!input.contractorLicenseVerified)reasons.push("contractor_license_pending");
  if(!input.isolatedB2CBackend)reasons.push("b2c_backend_not_ready");
 }
 // No live launch function exists. Even complete checks stay review-only.
 return {status:reasons.length?"blocked":"review_only",reasons};
}
