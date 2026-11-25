/** Job titles (cargo). Must match the DB check list. Authorization still comes from agency_memberships,
 * staff_portal_access and per-resource checks in the database; the one capability tied to a title is selling:
 * an ACTIVE seller/account executive with verified MFA may create and work their own leads, proposals and sales
 * (crm_private.is_seller), and only their own. */
export const JOB_TITLES = [
  ["seller", "Vendedor"], ["account_executive", "Ejecutivo de cuentas"], ["operator", "Operador"],
  ["support", "Soporte al cliente"], ["designer", "Diseñador"], ["developer", "Desarrollador"],
  ["marketing", "Marketing"], ["external", "Colaborador externo"],
] as const;
export type JobTitle = typeof JOB_TITLES[number][0];
export const isJobTitle = (v: string): v is JobTitle => JOB_TITLES.some(([k]) => k === v);
