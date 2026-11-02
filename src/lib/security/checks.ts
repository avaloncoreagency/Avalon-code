import "server-only";
import { EXPECTED_HEADERS } from "./headers";

export type HeaderCheck =
  | { status: "not_configured" }
  | { status: "unreachable" }
  | { status: "checked"; url: string; httpStatus: number; present: string[]; missing: string[] };

/**
 * Fetches the app's own login page (fixed origin from APP_ORIGIN, never user
 * input, so it cannot be used for SSRF) and reports which security headers the
 * live deployment actually returns.
 */
export async function checkLiveHeaders(origin: string | null, timeoutMs = 4000): Promise<HeaderCheck> {
  if (!origin) return { status: "not_configured" };
  const url = `${origin}/admin/login`;
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const present = EXPECTED_HEADERS.filter(name => response.headers.has(name));
    return { status: "checked", url, httpStatus: response.status, present: [...present], missing: EXPECTED_HEADERS.filter(name => !response.headers.has(name)) };
  } catch {
    return { status: "unreachable" };
  }
}

/** Deployment metadata exposed by Vercel system environment variables, if enabled. */
export function deploymentInfo() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    environment: process.env.VERCEL_ENV ?? null,
    commit: sha ? sha.slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    region: process.env.VERCEL_REGION ?? null,
  };
}
