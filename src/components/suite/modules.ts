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
};
export type IconName = "dashboard" | "crm" | "website" | "store" | "blueprint" | "receptionist" | "marketing" | "settings" | "profile" | "logout";

export const modules: ModuleDef[] = [
  { slug: "crm", key: "crm", href: "/admin/workspace/crm", name: "CRM", icon: "crm", accent: "cyan",
    description: { es: "Lead Hunter, pipeline, ventas, clientes 360°, calendario y tareas.", en: "Lead Hunter, pipeline, sales, 360° clients, calendar and tasks." } },
  { slug: "website-designer", key: "website", href: "/admin/workspace/website-designer", name: "Website Hunter", icon: "website", accent: "violet",
    description: { es: "Gestiona webs de clientes, conexiones, recursos, cambios y mantenimiento.", en: "Manage client websites, connections, resources, changes and maintenance." } },
  { slug: "ecommerce-designer", key: "ecommerce", href: "/admin/workspace/ecommerce-designer", name: "E-commerce Designer", icon: "store", accent: "magenta",
    description: { es: "Catálogos, productos, precios e inventario por tienda.", en: "Catalogs, products, pricing and inventory per store." } },
  { slug: "crm-creator", key: "crm_creator", href: "/admin/workspace/crm-creator", name: "CRM Creator", icon: "blueprint", accent: "blue",
    description: { es: "Administra proyectos CRM de clientes y conserva su configuración.", en: "Manage client CRM projects and maintain their configuration." } },
  { slug: "ai-receptionist", key: "receptionist", href: "/admin/workspace/ai-receptionist", name: "AI Receptionist", icon: "receptionist", accent: "teal",
    description: { es: "Gestiona asistentes de clientes, configuración y conexiones autorizadas.", en: "Manage client assistants, configuration and authorized connections." } },
  { slug: "marketing-hub", key: "marketing", href: "/admin/workspace/marketing-hub", name: "Marketing Hub", icon: "marketing", accent: "amber",
    description: { es: "Campañas, calendario editorial y planificación de contenido.", en: "Campaigns, editorial calendar and content planning." } },
];

export const moduleBySlug = (slug: string) => modules.find(m => m.slug === slug);
