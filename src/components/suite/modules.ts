import type { Lang } from "@/lib/i18n";

export type ModuleStatus = "operational" | "in_development" | "integration_pending";
export type ModuleDef = {
  slug: string;
  href: string;
  name: string;
  icon: IconName;
  accent: "cyan" | "violet" | "magenta" | "blue" | "teal" | "amber";
  key: "crm" | "website" | "ecommerce" | "crm_creator" | "receptionist" | "marketing";
  description: Record<Lang, string>;
  owner?: string;
};
export type IconName = "dashboard" | "crm" | "website" | "store" | "blueprint" | "receptionist" | "marketing" | "settings" | "profile" | "logout";

export const modules: ModuleDef[] = [
  { slug: "crm", key: "crm", href: "/admin/workspace/crm", name: "CRM", icon: "crm", accent: "cyan", owner: "Samuel",
    description: { es: "Leads, pipeline, actividades y seguimiento comercial.", en: "Leads, pipeline, activities and sales follow-up." } },
  { slug: "website-designer", key: "website", href: "/admin/workspace/website-designer", name: "Website Designer", icon: "website", accent: "violet",
    description: { es: "Proyectos web, páginas por bloques, vista previa y versiones.", en: "Web projects, block pages, preview and versions." } },
  { slug: "ecommerce-designer", key: "ecommerce", href: "/admin/workspace/ecommerce-designer", name: "E-commerce Designer", icon: "store", accent: "magenta",
    description: { es: "Catálogos, productos, precios e inventario por tienda.", en: "Catalogs, products, pricing and inventory per store." } },
  { slug: "crm-creator", key: "crm_creator", href: "/admin/workspace/crm-creator", name: "CRM Creator", icon: "blueprint", accent: "blue",
    description: { es: "Diseña entidades, campos, pipelines y permisos para clientes.", en: "Design entities, fields, pipelines and permissions for clients." } },
  { slug: "ai-receptionist", key: "receptionist", href: "/admin/workspace/ai-receptionist", name: "AI Receptionist", icon: "receptionist", accent: "teal",
    description: { es: "Configura asistentes, horarios, FAQ y base de conocimiento.", en: "Configure assistants, hours, FAQ and knowledge base." } },
  { slug: "marketing-hub", key: "marketing", href: "/admin/workspace/marketing-hub", name: "Marketing Hub", icon: "marketing", accent: "amber",
    description: { es: "Campañas, calendario editorial y planificación de contenido.", en: "Campaigns, editorial calendar and content planning." } },
];

export const moduleBySlug = (slug: string) => modules.find(m => m.slug === slug);
