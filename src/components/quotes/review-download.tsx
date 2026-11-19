"use client";

import { useState } from "react";
import s from "@/components/sales/sales.module.css";
import w from "./quotes.module.css";

/** The owner confirms they reviewed the preview before taking the client PDF. Downloading is not "sent". */
export function ReviewBeforeDownload({ lang, href, fileName }: { lang: "es" | "en"; href: string; fileName: string }) {
  const [reviewed, setReviewed] = useState(false);
  const es = lang === "es";
  return (
    <div className={w.actionsGrid}>
      <label className={s.choice}>
        <span><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} aria-describedby="quote-review-hint" />{" "}
          {es ? "Revisé la vista previa: importes, condiciones y datos del cliente son correctos." : "I reviewed the preview: amounts, terms and client details are correct."}</span>
      </label>
      <div className={s.inline}>
        {reviewed
          ? <a className={`${s.button} ${s.primary}`} href={href} download={fileName}>{es ? "Descargar PDF" : "Download PDF"}</a>
          : <button type="button" className={s.button} disabled>{es ? "Descargar PDF" : "Download PDF"}</button>}
        <small id="quote-review-hint" className={w.hint}>{es ? "Descargar no marca la cotización como enviada: registra el envío en «Acciones»." : "Downloading does not mark the quote as sent: record the send under Actions."}</small>
      </div>
    </div>
  );
}
