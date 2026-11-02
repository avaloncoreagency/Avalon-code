/** Integration contracts only. Credentials and implementation stay server-side. */
export type ConnectionState =
  | { connected: false; reason: string }
  | { connected: true; updatedAt: string; source: string };
export interface CalendarProvider {
  status(): Promise<ConnectionState>;
  // Future implementations must use stable local IDs as idempotency keys.
  syncEvent(localEventId: string): Promise<{ externalId: string }>;
}
export interface ProspectProvider {
  status(): Promise<ConnectionState>;
  search(query: {
    industry: string;
    location: string;
  }): Promise<{ company: string; source: string; acquiredAt: string }[]>;
}
export interface UsageProvider {
  status(): Promise<ConnectionState>;
  readPeriod(
    start: string,
    end: string,
  ): Promise<{
    amount: number;
    unit: string;
    source: string;
    updatedAt: string;
  }>;
}
const disconnected = async (): Promise<ConnectionState> => ({
  connected: false,
  reason:
    "No conectado: requiere autorización, credenciales de prueba y revisión del proveedor.",
});
const unavailable = async (): Promise<never> => {
  throw new Error("Integración no autorizada ni configurada");
};
export const googleCalendar: CalendarProvider = {
  status: disconnected,
  syncEvent: unavailable,
};
export const prospectSearch: ProspectProvider = {
  status: disconnected,
  search: unavailable,
};
export const usageProviders: Record<
  "Codex" | "Claude" | "Higgsfield",
  UsageProvider
> = {
  Codex: { status: disconnected, readPeriod: unavailable },
  Claude: { status: disconnected, readPeriod: unavailable },
  Higgsfield: { status: disconnected, readPeriod: unavailable },
};
