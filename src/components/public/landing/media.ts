/**
 * Public media manifest. Every image/video on the landing comes from here, so Higgsfield exports can be replaced
 * without touching components. Files are static, optimized and served from /public/brand (no AI call per visit).
 * Provenance (Higgsfield job ids, model, prompt) is recorded in docs/brand/HIGGSFIELD_MEDIA.md.
 */
export type Media = { src: string; small: string; video: string | null; alt: { es: string; en: string }; w: number; h: number };

/** `file` without extension: /brand/<file>.webp (full), /brand/<file>-<small>.webp, optional /brand/<file>-loop.mp4. */
const img = (file: string, w: number, h: number, es: string, en: string, small = 720, loop = false): Media => ({
  src: `/brand/${file}.webp`, small: `/brand/${file}-${small}.webp`, video: loop ? `/brand/${file}-loop.mp4` : null, w, h, alt: { es, en },
});

export const MEDIA = {
  hero: {
    desktop: img("hero-desktop", 2400, 1350, "Ecosistema de herramientas digitales de Avalon flotando en tarjetas de vidrio", "Avalon's digital tools ecosystem floating as glass cards", 1200),
    mobile: img("hero-mobile", 1080, 1920, "Ecosistema de herramientas digitales de Avalon en tarjetas de vidrio", "Avalon's digital tools as glass cards", 640),
    video: "/brand/hero-loop.mp4" as string | null,
    videoMobile: "/brand/hero-loop-mobile.mp4" as string | null,
  },
  devices: img("devices", 1920, 1080, "Laptop, teléfono y tablet mostrando paneles de software de ejemplo", "Laptop, phone and tablet showing sample software dashboards", 960, true),
  closing: img("closing", 1920, 1080, "", ""),
  logo: img("logo-sculpture", 1920, 1080, "Escultura de vidrio del símbolo de Avalon sobre una plataforma de luz", "Glass sculpture of the Avalon mark on a ring of light", 960, true),
  network: { poster: "/brand/network.webp", video: "/brand/network-loop.mp4" },
  products: {
    ecommerce: img("ecommerce", 1440, 1078, "Tablet con una tienda en línea de ejemplo", "Tablet with a sample online store", 720, true),
    receptionist: img("receptionist", 1440, 1078, "Representación de una recepcionista de IA con ondas de voz", "Illustration of an AI receptionist with voice waves", 720, true),
    automation: img("automation", 1440, 1078, "Herramientas conectadas por flujos de luz", "Tools connected by flows of light", 720, true),
    marketing: img("marketing", 1440, 1078, "Teléfono con un anuncio y métricas ilustrativas", "Phone with an ad and illustrative metrics", 720, true),
  },
} as const;

/** The cinematic that best represents each solution (Communication Hub shares one; CRM/Website share the devices). */
export const VISUAL_FOR: Record<string, Media> = {
  website: MEDIA.devices, crm: MEDIA.devices, ecommerce: MEDIA.products.ecommerce, receptionist: MEDIA.products.receptionist,
  chatbots: MEDIA.products.receptionist, marketing: MEDIA.products.marketing, funnels: MEDIA.products.marketing, automation: MEDIA.products.automation,
};
