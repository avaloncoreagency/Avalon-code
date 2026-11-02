import "server-only";
import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth/session";
import { isUuid } from "./domain";

/** Every server action re-verifies identity + owner membership (actions are public POST endpoints). */
export async function ownerForAction() {
  const session = await getOwnerSession();
  if (!session) redirect("/admin/login?error=unauthorized");
  return session;
}

export function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function uuidField(form: FormData, name: string) {
  const value = field(form, name);
  return isUuid(value) ? value : null;
}

/** Redirect to an application-built internal path with a status code. */
export function back(path: string, params: Record<string, string> = {}): never {
  if (!path.startsWith("/admin/") || path.startsWith("//")) redirect("/admin/dashboard");
  const [pathname, hash] = path.split("#");
  const query = new URLSearchParams(params).toString();
  redirect(`${pathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`);
}
