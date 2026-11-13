import type { Lang } from "@/lib/i18n";

export type ModuleStatus = "operational" | "in_development" | "integration_pending";
export type ModuleDef = {
  slug: string;
  href: string;
  name: string;
  icon: IconName;
  accent: "cyan" | "violet" | "magenta" | "blue" | "teal" | "amber";
  key: "crm" | "website" | "ecommerce" | "crm_creator" | "communications" | "marketing";
  description: Record<Lang, string>;
};
export type IconName = "dashboard" | "crm" | "website" | "store" | "blueprint" | "receptionist" | "chatbots" | "communications" | "marketing" | "settings" | "profile" | "logout";

export const modules: ModuleDef[] = [
  { slug: "crm", key: "crm", href: "/admin/workspace/crm", name: "CRM", icon: "crm", accent: "cyan",
    description: { es: "Lead Hunter, pipeline, ventas, clientes 360°, calendario y tareas.", en: "Lead Hunter, pipeline, sales, 360° clients, calendar and tasks." } },
  { slug: "website-designer", key: "website", href: "/admin/workspace/website-designer", name: "Website Designer", icon: "website", accent: "violet",
    description: { es: "Gestiona webs de clientes, conexiones, recursos, cambios y mantenimiento.", en: "Manage client websites, connections, resources, changes and maintenance." } },
  { slug: "ecommerce-designer", key: "ecommerce", href: "/admin/workspace/ecommerce-designer", name: "E-commerce Designer", icon: "store", accent: "magenta",
    description: { es: "Administra tiendas externas, URLs, entregas, versiones y errores.", en: "Manage external stores, URLs, deliveries, versions and issues." } },
  { slug: "crm-creator", key: "crm_creator", href: "/admin/workspace/crm-creator", name: "CRM Creator", icon: "blueprint", accent: "blue",
    description: { es: "Administra proyectos CRM de clientes y conserva su configuración.", en: "Manage client CRM projects and maintain their configuration." } },
  { slug: "ai-communications", key: "communications", href: "/admin/workspace/ai-communications", name: "COMMUNICATION HUB", icon: "communications", accent: "teal",
    description: { es: "Agentes externos por empresa: accesos, entregas y mantenimiento.", en: "External agents by company: access, deliveries and maintenance." } },
  { slug: "marketing-hub", key: "marketing", href: "/admin/workspace/marketing-hub", name: "Marketing Hub", icon: "marketing", accent: "amber",
    description: { es: "Campañas y funnels externos con versiones y seguimiento.", en: "External campaigns and funnels with versions and tracking." } },
];

export const moduleBySlug = (slug: string) => modules.find(m => m.slug === slug);
