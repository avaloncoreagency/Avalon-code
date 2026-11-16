/**
 * Public media manifest. Every image/video on the landing comes from here, so Higgsfield exports can be replaced
 * without touching components. Files are static, optimized and served from /public/brand (no AI call per visit).
 * Provenance (Higgsfield job ids, model, prompt) is recorded in docs/brand/HIGGSFIELD_MEDIA.md.
 */
export type Media = { src: string; alt: { es: string; en: string }; w: number; h: number };

const img = (file: string, w: number, h: number, es: string, en: string): Media => ({ src: `/brand/${file}`, w, h, alt: { es, en } });

export const MEDIA = {
  hero: {
    desktop: img("hero-desktop.webp", 1920, 1080, "Ecosistema de herramientas digitales de Avalon flotando en tarjetas de vidrio", "Avalon's digital tools ecosystem floating as glass cards"),
    mobile: img("hero-mobile.webp", 1080, 1920, "Ecosistema de herramientas digitales de Avalon en tarjetas de vidrio", "Avalon's digital tools as glass cards"),
    video: "/brand/hero-loop.mp4" as string | null,
    videoMobile: "/brand/hero-loop-mobile.mp4" as string | null,
  },
  devices: img("devices.webp", 1920, 1080, "Laptop, teléfono y tablet mostrando paneles de software de ejemplo", "Laptop, phone and tablet showing sample software dashboards"),
  closing: img("closing.webp", 1920, 1080, "", ""),
  products: {
    ecommerce: img("ecommerce.webp", 1440, 1080, "Tablet con una tienda en línea de ejemplo", "Tablet with a sample online store"),
    receptionist: img("receptionist.webp", 1440, 1080, "Representación de una recepcionista de IA con ondas de voz", "Illustration of an AI receptionist with voice waves"),
    automation: img("automation.webp", 1440, 1080, "Herramientas conectadas por flujos de luz", "Tools connected by flows of light"),
    marketing: img("marketing.webp", 1440, 1080, "Teléfono con un anuncio y métricas ilustrativas", "Phone with an ad and illustrative metrics"),
  },
} as const;
