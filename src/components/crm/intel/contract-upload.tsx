"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lang } from "@/lib/crm/intel/types";
import s from "@/components/sales/sales.module.css";

/**
 * Uploads the signed document through the EXISTING private lead-attachment endpoint (type checked by extension and
 * file signature, 5 MB, stored privately in the database — never a public URL). Then refreshes the page.
 */
export function ContractUpload({ lang, lead }: { lang: Lang; lead: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("lead", lead);
    form.set("note", lang === "es" ? "Documento contractual firmado" : "Signed contract document");
    setState("busy"); setError("");
    try {
      const res = await fetch("/admin/workspace/crm/pipeline/files", { method: "POST", body: form });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setState("error"); setError(body.error ?? (lang === "es" ? "No se pudo subir el archivo." : "Upload failed.")); return; }
      setState("ok"); router.refresh();
    } catch {
      setState("error"); setError(lang === "es" ? "Sin conexión: el archivo no se subió. Inténtalo de nuevo." : "Offline: the file was not uploaded. Try again.");
    }
  }
  return (
    <form onSubmit={onSubmit} className={s.toolbar} aria-busy={state === "busy"}>
      <label><span>{lang === "es" ? "Subir documento firmado (PDF, imagen o DOCX, máx. 5 MB)" : "Upload signed document (PDF, image or DOCX, max 5 MB)"}</span>
        <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" /></label>
      <button type="submit" className={s.button} disabled={state === "busy"}>{state === "busy" ? (lang === "es" ? "Subiendo…" : "Uploading…") : (lang === "es" ? "Subir" : "Upload")}</button>
      {state === "ok" && <span role="status" className={s.muted}>{lang === "es" ? "Documento guardado de forma privada." : "Document stored privately."}</span>}
      {state === "error" && <span role="alert" className={s.muted} style={{ color: "#ffd3dc" }}>{error}</span>}
    </form>
  );
}
