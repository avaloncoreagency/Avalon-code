"use client";
// Isolated preview: the document is loaded into <iframe sandbox="allow-scripts" srcdoc> — an opaque origin with no
// cookies, no storage, no access to Avalon OS and (via its CSP) no network. Never `allow-same-origin`.
import { useEffect, useState } from "react";
import s from "./library.module.css";

export function PreviewFrame({ projectId, versionId, pages, entry, lang }: { projectId: string; versionId: string; pages: string[]; entry: string | null; lang: "es" | "en" }) {
  const [page, setPage] = useState(entry ?? pages[0] ?? "");
  const [doc, setDoc] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  useEffect(() => {
    if (!page) return;
    let alive = true;
    setDoc(null);
    fetch(`/admin/workspace/library/${projectId}/preview?version=${versionId}&page=${encodeURIComponent(page)}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (!alive) return; if (j.html) { setDoc(j.html); setInfo(lang === "es" ? `${j.stats.inlined} recursos incluidos${j.stats.skipped ? ` · ${j.stats.skipped} omitidos por tamaño` : ""}${j.stats.external ? ` · ${j.stats.external} externos bloqueados` : ""}` : `${j.stats.inlined} assets inlined`); } else setInfo(j.error ?? "error"); })
      .catch(() => alive && setInfo(lang === "es" ? "Vista previa no disponible." : "Preview unavailable."));
    return () => { alive = false; };
  }, [projectId, versionId, page, lang]);
  if (!pages.length) return <p className={s.muted}>{lang === "es" ? "Esta versión no tiene páginas HTML para previsualizar." : "This version has no HTML pages to preview."}</p>;
  return (
    <div className={s.preview}>
      <div className={s.row}>
        <label>{lang === "es" ? "Página" : "Page"}<select value={page} onChange={e => setPage(e.target.value)}>{pages.map(p => <option key={p}>{p}</option>)}</select></label>
        <small className={s.muted}>{info}</small>
      </div>
      {doc === null ? <div className={s.frameLoading} aria-busy="true">…</div> :
        <iframe title={lang === "es" ? "Vista previa aislada" : "Isolated preview"} sandbox="allow-scripts allow-forms" srcDoc={doc} className={s.frame} referrerPolicy="no-referrer" />}
      <p className={s.muted}>{lang === "es" ? "Vista aislada: sin cookies, sin red y sin acceso a Avalon OS. Los enlaces a otras páginas se eligen arriba; la vista completa es el Preview de Vercel." : "Isolated view: no cookies, no network, no access to Avalon OS. Pick other pages above; the full view is the Vercel Preview."}</p>
    </div>
  );
}
