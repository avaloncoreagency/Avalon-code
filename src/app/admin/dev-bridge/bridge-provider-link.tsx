import type { ReactNode } from "react";

/** Only open HTTPS URLs belonging to the expected source, never arbitrary provider text. */
export function verifiedProviderHref(value: unknown, source: "github" | "vercel"): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const isGithub = host === "github.com";
    const isVercel = host === "vercel.app" || host.endsWith(".vercel.app")
      || host === "avaloncoreagency.com" || host.endsWith(".avaloncoreagency.com");
    return (source === "github" ? isGithub : isVercel) ? url.href : null;
  } catch {
    return null;
  }
}

/** Retain untrusted metadata as plain text instead of rendering a deceptive link. */
export function SafeProviderLink({ href, source, children }: {
  href: unknown;
  source: "github" | "vercel";
  children: ReactNode;
}) {
  const safe = verifiedProviderHref(href, source);
  return safe
    ? <a href={safe} rel="noopener noreferrer">{children}</a>
    : <span>{children} · enlace no verificado</span>;
}
