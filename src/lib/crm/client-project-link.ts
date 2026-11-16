import { clientId } from "@/lib/os/client-hud";

/** Stable-FK-only project association. Never guess a client from business names. */
export type ClientForProject = { id: string; status: string; origin_lead_id: string | null };
export type ProjectForClient = { client_id?: string | null; status: string; settings: Record<string, unknown> };

export type ProjectLinkDecision = "ok" | "already_linked" | "another_client" | "archived" | "lead_mismatch";

export function checkClientProjectLink(client: ClientForProject, project: ProjectForClient): ProjectLinkDecision {
  if (client.status === "archived" || project.status === "archived") return "archived";
  if (project.client_id === client.id) return "already_linked";
  if (project.client_id) return "another_client";
  // The legacy lead pointer is a stable UUID; do not silently reassign an unrelated company's work.
  const origin = clientId(project.settings ?? {});
  if (origin && origin !== client.origin_lead_id) return "lead_mismatch";
  return "ok";
}
