"use client";
// Import a project from iPhone or desktop: the file goes straight to PRIVATE storage through a one-time signed URL with
// real progress, then the server validates and registers it. Every state the user sees is a state the server returned.
import { useRef, useState } from "react";
import Link from "next/link";
import type { Category } from "@/lib/project-bridge/policy";
import s from "./library.module.css";

type Lang = "es" | "en";
type Problem = { path: string; reason: string };
type Phase = { kind: "idle" } | { kind: "uploading"; pct: number } | { kind: "validating" } | { kind: "done"; projectId: string; number: number; duplicate: boolean; warnings: string[] }
  | { kind: "error"; message: string; problems?: Problem[]; importId?: string; retryable?: boolean };

const T = {
  es: { file: "Archivo del proyecto (.zip o .html, máx. 25 MB)", category: "Biblioteca", name: "Nombre del proyecto", tool: "Herramienta de origen", go: "Importar proyecto",
    up: "Subiendo", val: "Validando y guardando de forma privada…", ok: "Importado", dup: "Contenido idéntico a la versión", open: "Abrir proyecto", retry: "Reintentar procesamiento",
    choose: "Elige un archivo .zip o .html.", big: "El archivo supera 25 MB.", net: "Error de red durante la subida. Vuelve a intentarlo.", version: "versión" },
  en: { file: "Project file (.zip or .html, max 25 MB)", category: "Library", name: "Project name", tool: "Source tool", go: "Import project",
    up: "Uploading", val: "Validating and storing privately…", ok: "Imported", dup: "Same content as version", open: "Open project", retry: "Retry processing",
    choose: "Choose a .zip or .html file.", big: "The file exceeds 25 MB.", net: "Network error during upload. Try again.", version: "version" },
};
const CATS: [string, string][] = [["website", "Website Designer"], ["ecommerce", "E-commerce Designer"], ["crm_creator", "CRM Creator"], ["apps", "Apps"]];
const TOOLS: [string, string][] = [["chatgpt", "ChatGPT"], ["claude_code", "Claude Code"], ["codex", "Codex"], ["higgsfield", "Higgsfield"], ["editor", "Editor"], ["manual", "Manual"], ["other", "Other"]];

function put(url: string, file: File, type: string, onPct: (n: number) => void) {
  return new Promise<boolean>(resolve => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("content-type", type);
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = e => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    x.onload = () => resolve(x.status >= 200 && x.status < 300);
    x.onerror = () => resolve(false);
    x.send(file);
  });
}

export function Importer({ lang, projectId, defaultCategory = "website", lockedCategory, messages }: { lang: Lang; projectId?: string; defaultCategory?: string; lockedCategory?: Category; messages: Record<string, string> }) {
  const t = T[lang];
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const key = useRef<string>("");
  const busy = phase.kind === "uploading" || phase.kind === "validating";

  async function process(importId: string) {
    setPhase({ kind: "validating" });
    const r = await fetch(`/admin/workspace/library/imports/${importId}/process`, { method: "POST", headers: { "accept-language": lang } });
    const j = await r.json().catch(() => ({}));
    if (j.status === "registered" || j.status === "duplicate")
      setPhase({ kind: "done", projectId: j.projectId, number: j.number, duplicate: j.status === "duplicate", warnings: j.inspection?.warnings ?? [] });
    else setPhase({ kind: "error", message: j.message ?? messages[j.reason] ?? String(j.reason ?? j.error ?? r.status), problems: j.problems, importId, retryable: j.retryable });
  }

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = new FormData(ev.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !/\.(zip|html?)$/i.test(file.name)) return setPhase({ kind: "error", message: t.choose });
    if (file.size > 25 * 1024 * 1024) return setPhase({ kind: "error", message: t.big });
    key.current = key.current || crypto.randomUUID();
    const r = await fetch("/admin/workspace/library/uploads", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, category: form.get("category"), projectName: form.get("projectName") || null, sourceTool: form.get("sourceTool"), projectId: projectId ?? null, idempotencyKey: key.current }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.importId) return setPhase({ kind: "error", message: messages[j.error] ?? String(j.error ?? r.status) });
    key.current = "";
    if (j.upload) {
      setPhase({ kind: "uploading", pct: 0 });
      const ok = await put(j.upload.url, file, j.upload.contentType, pct => setPhase({ kind: "uploading", pct }));
      if (!ok) return setPhase({ kind: "error", message: t.net, importId: j.importId, retryable: false });
    }
    await process(j.importId);
  }

  return (
    <form className={s.importer} onSubmit={submit} aria-busy={busy}>
      <label className={s.drop}>
        <span>{t.file}</span>
        <input name="file" type="file" accept=".zip,.html,.htm,application/zip,text/html" required disabled={busy} />
      </label>
      {!projectId && <div className={s.row}>
        {!lockedCategory && <label>{t.category}<select name="category" defaultValue={defaultCategory} disabled={busy}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
        <label>{t.name}<input name="projectName" maxLength={120} disabled={busy}/></label>
      </div>}
      {(projectId || lockedCategory) && <input type="hidden" name="category" value={lockedCategory ?? defaultCategory} />}
      <label>{t.tool}<select name="sourceTool" defaultValue="chatgpt" disabled={busy}>{TOOLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <button className={s.primary} disabled={busy}>{t.go}</button>
      <div aria-live="polite" className={s.status}>
        {phase.kind === "uploading" && <><span>{t.up} {phase.pct}%</span><progress max={100} value={phase.pct} /></>}
        {phase.kind === "validating" && <span className={s.pulse}>{t.val}</span>}
        {phase.kind === "done" && <p data-state={phase.duplicate ? "duplicate" : "registered"}>
          {phase.duplicate ? `${t.dup} ${phase.number}.` : `${t.ok} · ${t.version} ${phase.number}.`} <Link href={`/admin/workspace/${defaultCategory === "apps" ? "library" : "products"}/${phase.projectId}`}>{t.open}</Link>
          {phase.warnings.length > 0 && <small> {phase.warnings.join(" · ")}</small>}
        </p>}
        {phase.kind === "error" && <div role="alert" data-state="error">
          <p>{phase.message}</p>
          {phase.problems && phase.problems.length > 0 && <ul>{phase.problems.slice(0, 20).map(p => <li key={p.path + p.reason}><code>{p.path}</code> — {messages[p.reason.split(":")[0]] ?? p.reason}</li>)}</ul>}
          {phase.importId && phase.retryable && <button type="button" className={s.ghost} onClick={() => process(phase.importId!)}>{t.retry}</button>}
        </div>}
      </div>
    </form>
  );
}

/** Processes an import that arrived through the API inbox (owner review step). */
export function ProcessButton({ importId, label }: { importId: string; label: string }) {
  const [state, setState] = useState<string>("");
  return <span className={s.inline}>
    <button type="button" className={s.ghost} disabled={state === "…"} onClick={async () => {
      setState("…");
      const r = await fetch(`/admin/workspace/library/imports/${importId}/process`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setState(j.status === "registered" ? "✓" : j.message ?? j.status ?? String(r.status));
      if (j.status === "registered") window.location.reload();
    }}>{label}</button>
    {state && <small aria-live="polite">{state}</small>}
  </span>;
}
