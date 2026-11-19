"use client";

import { useState } from "react";
import s from "@/components/sales/sales.module.css";
import g from "./guide.module.css";

/** UI review acknowledgement only: this does not represent signature or legal approval. */
export function ReviewBeforeDownload({ lang, href }: { lang: "es" | "en"; href: string }) {
  const [reviewed, setReviewed] = useState(false);
  const es = lang === "es";
  return (
    <div className={g.reviewGate}>
      <label className={g.reviewLabel}>
        <input
          type="checkbox"
          checked={reviewed}
          onChange={event => setReviewed(event.target.checked)}
          aria-describedby="agreement-review-hint"
        />
        <span>{es
          ? "He abierto la vista previa y revisado el contenido de este borrador."
          : "I have opened the preview and reviewed this draft's contents."}</span>
      </label>
      <small id="agreement-review-hint">{es
        ? "Esta confirmación no sustituye una revisión legal ni significa que el contrato esté firmado."
        : "This acknowledgement is not legal approval or a signature."}</small>
      {reviewed ? (
        <a className={s.button + " " + s.primary} href={href}>
          {es ? "Descargar borrador PDF" : "Download draft PDF"}
        </a>
      ) : (
        <button type="button" disabled className={s.button} title={es ? "Primero revisa el PDF" : "Review the PDF first"}>
          {es ? "Descargar borrador PDF" : "Download draft PDF"}
        </button>
      )}
    </div>
  );
}
