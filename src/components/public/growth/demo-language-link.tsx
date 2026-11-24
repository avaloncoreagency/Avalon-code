"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { demoLink, readDemoLink } from "./share-link";
import type { Lang } from "../landing/copy";
/** Preserve only allowlisted public demo context when switching the global language. */
export function DemoLanguageLink({ lang, path, className, label, children }: { lang: Lang; path: string; className: string; label: string; children: ReactNode }) {
  const [href, setHref] = useState(lang === "es" ? path + "?lang=en" : path);
  useEffect(() => {
    if (path === "/" && new URLSearchParams(window.location.search).has("demo")) {
      const selected = readDemoLink(window.location.search);
      setHref(demoLink(lang === "es" ? "en" : "es", selected.industry, selected.demo));
    }
  }, [lang, path]);
  return <Link className={className} href={href} hrefLang={lang === "es" ? "en" : "es"} aria-label={label}>{children}</Link>;
}
