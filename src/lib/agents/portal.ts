/**
 * AGENT PORTAL (sidebar entry directly above «Configuración»): the single place where owners invite and manage agents.
 * The portal page itself (`/admin/staff`: roster, permissions, client/lead grants, invitations) ships with the Staff
 * release owned by Codex (#341/#342). This module only fixes the shared path so other features link to it instead of
 * building a second agent area.
 */
export const AGENT_PORTAL_PATH = "/admin/staff";
export const AGENT_PORTAL_LABEL: [string, string] = ["PORTAL DE AGENTES", "AGENT PORTAL"];
