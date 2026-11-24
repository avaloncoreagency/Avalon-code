/** Job titles (cargo). Presentation and filtering only: authorization comes from agency_memberships,
 * staff_portal_access capabilities and per-resource grants enforced by RLS. Must match the DB check list. */
export const JOB_TITLES = [
  ["seller", "Vendedor"], ["account_executive", "Ejecutivo de cuentas"], ["operator", "Operador"],
  ["support", "Soporte al cliente"], ["designer", "Diseñador"], ["developer", "Desarrollador"],
  ["marketing", "Marketing"], ["external", "Colaborador externo"],
] as const;
export type JobTitle = typeof JOB_TITLES[number][0];
export const isJobTitle = (v: string): v is JobTitle => JOB_TITLES.some(([k]) => k === v);
