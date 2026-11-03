// Avalon virtual AI managers. Their *target* responsibilities are documented here; their *execution*
// status is never assumed. Avalon has no agent execution backend today, so every manager is "offline":
// requests are registered (office_agent_requests) and are never shown as executed.
export type IntegrationStatus = "available" | "configured_idle" | "offline" | "not_implemented";
export type ManagerKey = "ren" | "shin" | "haru" | "sora" | "kenji";
export type Manager = {
  key: ManagerKey; name: string; hue: number;
  role: { es: string; en: string };
  modules: { es: string; en: string }[];
  station: { x: number; y: number };
  examples: { es: string; en: string };
};

export const MANAGERS: Manager[] = [
  { key: "ren", name: "REN", hue: 250, role: { es: "Dirección y coordinación operativa", en: "Direction and operational coordination" },
    modules: [{ es: "Dashboard", en: "Dashboard" }, { es: "Coordinación entre módulos", en: "Cross-module coordination" }],
    station: { x: 50, y: 58 }, examples: { es: "REN, muéstrame lo que falta para completar Avalon.", en: "REN, show me what is left to complete Avalon." } },
  { key: "shin", name: "SHIN", hue: 205, role: { es: "Seguridad, autenticación e infraestructura", en: "Security, authentication and infrastructure" },
    modules: [{ es: "Seguridad", en: "Security" }, { es: "Acceso y sesiones", en: "Access and sessions" }],
    station: { x: 22, y: 66 }, examples: { es: "SHIN, revisa las alertas de seguridad.", en: "SHIN, review the security alerts." } },
  { key: "haru", name: "HARU", hue: 275, role: { es: "CRM, producto y experiencia de usuario", en: "CRM, product and user experience" },
    modules: [{ es: "CRM", en: "CRM" }, { es: "Calendario", en: "Calendar" }, { es: "Tareas", en: "Tasks" }],
    station: { x: 36, y: 72 }, examples: { es: "HARU, enséñame las tareas pendientes del CRM.", en: "HARU, show me the CRM's pending tasks." } },
  { key: "sora", name: "SORA", hue: 190, role: { es: "Lead Hunter, marketing e integraciones", en: "Lead Hunter, marketing and integrations" },
    modules: [{ es: "Lead Hunter", en: "Lead Hunter" }, { es: "Marketing Hub", en: "Marketing Hub" }],
    station: { x: 64, y: 72 }, examples: { es: "SORA, revisa oportunidades de Lead Hunter.", en: "SORA, review Lead Hunter opportunities." } },
  { key: "kenji", name: "KENJI", hue: 35, role: { es: "Calidad, pruebas, rendimiento y costos", en: "Quality, testing, performance and costs" },
    modules: [{ es: "Pruebas y CI", en: "Tests and CI" }, { es: "Uso de IA", en: "AI usage" }],
    station: { x: 78, y: 66 }, examples: { es: "KENJI, resume las pruebas fallidas.", en: "KENJI, summarize the failing tests." } },
];

/** What Avalon can verify about each manager today. Update only when a real connection exists. */
export const MANAGER_INTEGRATION = {
  status: "offline" as IntegrationStatus,
  tools: [] as string[],
  automations: [] as string[],
  lastVerifiedRun: null as string | null,
  // Recorded outside Avalon (docs/graphify/AUTOMATION_PROMPT_BASELINE_20261102.md); not live, not verifiable from the app.
  externalNote: { es: "Existen como automatizaciones de Codex fuera de Avalon; su estado no es consultable desde la app.",
    en: "They exist as Codex automations outside Avalon; their state cannot be read from the app." },
};

export const isManagerKey = (v: unknown): v is ManagerKey => MANAGERS.some(m => m.key === v);
