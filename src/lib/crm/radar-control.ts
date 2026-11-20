/** Administrative deployment switch. Only an authorized owner/operator may re-enable external requests. */
export const RADAR_PAUSED_MESSAGE = "Radar pausado por decisión administrativa";
export function radarExternalEnabled(env: Record<string,string | undefined> = process.env): boolean {
  return env.AVALON_RADAR_EXTERNAL_ENABLED === "true";
}
