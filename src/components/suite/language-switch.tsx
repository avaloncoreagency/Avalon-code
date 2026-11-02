"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LANG_COOKIE, type Lang } from "@/lib/i18n";

export function persistLanguage(lang: Lang) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax${secure}`;
  try { localStorage.setItem("avalon-language", lang); } catch { /* Storage is optional. */ }
  document.documentElement.lang = lang;
}

export function LanguageSwitch({ lang, className, onChange }: { lang: Lang; className?: string; onChange?: (lang: Lang) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={className} role="group" aria-label={lang === "es" ? "Idioma" : "Language"} aria-busy={pending}>
      {(["es", "en"] as const).map(option => (
        <button key={option} type="button" aria-pressed={lang === option} lang={option}
          aria-label={option === "es" ? "Español" : "English"}
          onClick={() => {
            if (option === lang) return;
            persistLanguage(option);
            onChange?.(option);
            start(() => router.refresh());
          }}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
