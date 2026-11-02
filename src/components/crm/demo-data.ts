export type LeadStage = 'Nuevo' | 'Contactado' | 'Calificado' | 'Reunión' | 'Propuesta' | 'Negociación' | 'Ganado' | 'Perdido';
export type DemoLead = { id: string; name: string; company: string; stage: LeadStage; value: number; owner: string; nextAction: string };
export const stages: LeadStage[] = ['Nuevo','Contactado','Calificado','Reunión','Propuesta','Negociación','Ganado','Perdido'];
export const demoLeads: DemoLead[] = [
  { id: 'L-001', name: 'Alex Rivera', company: 'Northstar Studio', stage: 'Nuevo', value: 2400, owner: 'Samuel', nextAction: 'Primer contacto' },
  { id: 'L-002', name: 'Taylor Cruz', company: 'Harbor Coffee', stage: 'Contactado', value: 3800, owner: 'Miguel', nextAction: 'Enviar presentación' },
  { id: 'L-003', name: 'Jordan Lee', company: 'Bright Dental', stage: 'Calificado', value: 6200, owner: 'Samuel', nextAction: 'Agendar reunión' },
  { id: 'L-004', name: 'Casey Morgan', company: 'Evergreen Fitness', stage: 'Propuesta', value: 4900, owner: 'Miguel', nextAction: 'Seguimiento' },
  { id: 'L-005', name: 'Morgan Diaz', company: 'Lumen Retail', stage: 'Ganado', value: 7100, owner: 'Samuel', nextAction: 'Inicio de proyecto' },
];
export const demoEvents = [
  { day: 'Lun', time: '09:30', title: 'Revisión de pipeline', owner: 'Samuel', type: 'Interno' },
  { day: 'Mar', time: '11:00', title: 'Discovery · Bright Dental', owner: 'Samuel', type: 'Lead' },
  { day: 'Mié', time: '14:00', title: 'Propuesta · Evergreen Fitness', owner: 'Miguel', type: 'Lead' },
  { day: 'Vie', time: '10:00', title: 'Planificación semanal', owner: 'Ambos', type: 'Interno' },
];
export const demoProspects = [
  { company: 'Cedar & Co.', industry: 'Servicios', location: 'Tampa, FL', score: 88, signal: 'Sitio web desactualizado' },
  { company: 'Summit Wellness', industry: 'Salud y bienestar', location: 'Orlando, FL', score: 81, signal: 'Oportunidad de automatización' },
  { company: 'Oakline Market', industry: 'Comercio', location: 'Miami, FL', score: 76, signal: 'Potencial de e-commerce' },
];
export const demoUsage = [
  { name: 'Codex', used: 0, limit: null as number | null, unit: 'No conectado', source: 'Sin integración' },
  { name: 'Claude', used: 0, limit: null as number | null, unit: 'No conectado', source: 'Sin integración' },
  { name: 'Higgsfield', used: 0, limit: null as number | null, unit: 'No conectado', source: 'Sin integración' },
];
