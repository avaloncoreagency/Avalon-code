import { emptyBlock, type Block } from "./domain";

export const WEBSITE_PAGE_TEMPLATE_KEYS = ["blank", "services", "portfolio"] as const;
export type WebsitePageTemplateKey = typeof WEBSITE_PAGE_TEMPLATE_KEYS[number];
export const WEBSITE_PAGE_TEMPLATE_LABELS: Record<WebsitePageTemplateKey, readonly [string,string]> = {
  blank: ["Portada sencilla", "Simple hero"],
  services: ["Negocio de servicios", "Service business"],
  portfolio: ["Portafolio profesional", "Professional portfolio"],
};

const templates: Record<Exclude<WebsitePageTemplateKey,"blank">, Record<"es"|"en",Block[]>> = {
  services: {
    es: [
      {type:"hero",heading:"Tu negocio, más cerca de tus clientes",subheading:"Presenta tus servicios con claridad y facilita el próximo paso.",buttonLabel:"",buttonHref:""},
      {type:"features",heading:"Nuestros servicios",items:["Servicio principal","Servicio adicional","Atención y seguimiento"]},
      {type:"text",heading:"Cómo trabajamos",body:"Describe tu proceso, tu cobertura y lo que recibe cada cliente."},
      {type:"cta",heading:"¿Cómo podemos ayudarte?",body:"Añade aquí tus datos de contacto verificados antes de entregar el sitio.",buttonLabel:"",buttonHref:""},
    ],
    en: [
      {type:"hero",heading:"Bring your business closer to customers",subheading:"Describe your services clearly and help visitors take the next step.",buttonLabel:"",buttonHref:""},
      {type:"features",heading:"Our services",items:["Main service","Additional service","Customer support"]},
      {type:"text",heading:"How we work",body:"Describe your process, service area and what your customers receive."},
      {type:"cta",heading:"How can we help?",body:"Add verified contact information before delivering this site.",buttonLabel:"",buttonHref:""},
    ],
  },
  portfolio: {
    es: [
      {type:"hero",heading:"Portafolio de proyectos",subheading:"Muestra trabajos reales, tu enfoque y tus especialidades.",buttonLabel:"",buttonHref:""},
      {type:"text",heading:"Sobre nuestro trabajo",body:"Sustituye este ejemplo por una presentación auténtica de tu experiencia."},
      {type:"features",heading:"Proyectos destacados",items:["Proyecto verificado 1","Proyecto verificado 2","Proyecto verificado 3"]},
      {type:"cta",heading:"Trabajemos juntos",body:"Añade un enlace de contacto aprobado por el cliente antes de publicar.",buttonLabel:"",buttonHref:""},
    ],
    en: [
      {type:"hero",heading:"Selected work",subheading:"Show real projects, your approach, and your specialties.",buttonLabel:"",buttonHref:""},
      {type:"text",heading:"About our work",body:"Replace this placeholder with an accurate description of your experience."},
      {type:"features",heading:"Featured projects",items:["Verified project 1","Verified project 2","Verified project 3"]},
      {type:"cta",heading:"Let's work together",body:"Add a client-approved contact link before publishing.",buttonLabel:"",buttonHref:""},
    ],
  },
};

/** Fresh objects every time: editing one customer must never change a shared template. */
export function websitePageTemplate(name: string, lang: "es"|"en"): Block[] | null {
  if (name === "blank") return [emptyBlock("hero")];
  if (name !== "services" && name !== "portfolio") return null;
  return structuredClone(templates[name][lang]);
}
