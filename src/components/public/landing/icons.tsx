import type { ServiceKey } from "./copy";

const P: Record<ServiceKey | "arrow" | "check" | "play" | "spark", string> = {
  website: "M3 5h18v11H3zM8 20h8M12 16v4",
  ecommerce: "M3 4h2l2.4 11h11.2L21 7H6.2M9 20a1 1 0 1 0 0-.01M18 20a1 1 0 1 0 0-.01",
  crm: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M21 19c0-2.5-1.6-4.6-4-5.3",
  receptionist: "M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1zM17 19c0 1.5-2 2-5 2",
  chatbots: "M4 5h16v11H9l-5 4zM9 10h.01M12 10h.01M15 10h.01",
  marketing: "M3 11v3l11 5V6L3 11zM14 8h3a4 4 0 0 1 0 8h-3M6 15l1 5h3l-1-4",
  funnels: "M3 4h18l-7 8v6l-4 2v-8z",
  automation: "M13 2 4 14h7l-1 8 9-12h-7z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12l5 5 9-10",
  play: "M8 5v14l11-7z",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
};

export function Icon({ name, size = 22 }: { name: keyof typeof P; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={P[name]} /></svg>;
}
