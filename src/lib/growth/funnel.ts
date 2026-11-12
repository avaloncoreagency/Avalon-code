/** Shared public Funnel Builder contract. Templates create INBOUND leads, never sales or appointments. */
export const FUNNEL_TEMPLATES = {
  capture: {
    label: "Captación",
    title: "Haz crecer tu negocio con Avalon",
    subheading: "Cuéntanos qué necesitas. Un especialista revisará tu solicitud.",
    cta: "Solicitar información",
    description: "Contacto voluntario para servicios y consultas.",
  },
  sales: {
    label: "Ventas",
    title: "Solicita una propuesta personalizada",
    subheading: "Conversemos sobre el proyecto. Esto no es una compra ni una cotización aceptada.",
    cta: "Solicitar propuesta",
    description: "Solicitud comercial; no confirma venta ni pago.",
  },
  appointments: {
    label: "Citas",
    title: "Solicita una conversación con nuestro equipo",
    subheading: "Déjanos tus datos y el motivo de tu consulta. No reservamos una cita automáticamente.",
    cta: "Solicitar una cita",
    description: "Solicitud de cita; no crea un evento en calendario.",
  },
} as const;

export type FunnelTemplate = keyof typeof FUNNEL_TEMPLATES;
export type PublicFunnel = {
  slug: string;
  title: string;
  subheading: string;
  cta: string;
  template: FunnelTemplate;
  /** Consent text version the visitor is shown; sent back with the form so a stale text is rejected. */
  consentVersion: string;
};

export const validSlug = (slug: string): boolean =>
  slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

export function isFunnelTemplate(value: unknown): value is FunnelTemplate {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FUNNEL_TEMPLATES, value);
}

/** Never trust an external RPC response as a renderable funnel without checking fields. */
export function publicFunnel(value: unknown): PublicFunnel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.slug !== "string" || !validSlug(record.slug) ||
      typeof record.title !== "string" || record.title.trim().length < 4 || record.title.length > 120 ||
      typeof record.subheading !== "string" || record.subheading.length > 500 ||
      typeof record.cta !== "string" || record.cta.trim().length < 4 || record.cta.length > 80 ||
      !isFunnelTemplate(record.template)) return null;
  return {
    slug: record.slug,
    title: record.title,
    subheading: record.subheading,
    cta: record.cta,
    template: record.template,
    consentVersion: typeof record.consent_version === "string" && /^[a-z0-9._-]{3,40}$/.test(record.consent_version)
      ? record.consent_version : "",
  };
}
