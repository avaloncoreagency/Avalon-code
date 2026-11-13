"use client";

import { useState } from "react";
import type { Lang } from "@/lib/i18n";
import { estimateSetup, estimateCommission, type SetupInput, type CommissionInput } from "@/lib/commercial/finance";
import styles from "../growth/growth.module.css";

const INITIAL_SETUP: SetupInput = {
  setupPrice: "", laborHours: "", hourlyRate: "", externalCosts: "", contingency: "", targetMargin: "",
};
const INITIAL_COMMISSION: CommissionInput = {
  collectedAmount: "", excludedAmount: "", ratePercent: "",
  signedTerms: false, eligibleAttribution: false, collectionVerified: false, legalReviewApproved: false,
};
function money(cents: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US",
    { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function CommercialCalculator({ lang }: { lang: Lang }) {
  const es = lang === "es";
  const [setup, setSetup] = useState<SetupInput>(INITIAL_SETUP);
  const [commission, setCommission] = useState<CommissionInput>(INITIAL_COMMISSION);
  const quote = estimateSetup(setup);
  const fee = estimateCommission(commission);
  const setupFields: {key: keyof SetupInput; label: string}[] = [
    { key: "setupPrice", label: es ? "Precio propuesto (USD)" : "Proposed price (USD)" },
    { key: "laborHours", label: es ? "Horas estimadas" : "Estimated hours" },
    { key: "hourlyRate", label: es ? "Costo por hora (USD)" : "Cost per hour (USD)" },
    { key: "externalCosts", label: es ? "Costos externos (USD)" : "External costs (USD)" },
    { key: "contingency", label: es ? "Contingencia (USD)" : "Contingency (USD)" },
    { key: "targetMargin", label: es ? "Margen objetivo (%)" : "Target margin (%)" },
  ];
  const commissionFields: {key: "collectedAmount" | "excludedAmount" | "ratePercent";label: string}[] = [
    { key: "collectedAmount", label: es ? "Importe cobrado por contratista (USD)" : "Contractor amount collected (USD)" },
    { key: "excludedAmount", label: es ? "Importe excluido por contrato (USD)" : "Excluded by contract (USD)" },
    { key: "ratePercent", label: es ? "Comisión acordada (%)" : "Agreed commission (%)" },
  ];
  const conditions: {key: "signedTerms" | "eligibleAttribution" | "collectionVerified" | "legalReviewApproved";label:string}[] = [
    { key: "signedTerms", label: es ? "Contrato y términos verificados" : "Contract and terms verified" },
    { key: "eligibleAttribution", label: es ? "Atribución válida y documentada" : "Attribution documented and eligible" },
    { key: "collectionVerified", label: es ? "Cobro del contratista verificado" : "Contractor collection verified" },
    { key: "legalReviewApproved", label: es ? "Revisión legal aprobada" : "Legal review approved" },
  ];
  return <div className={styles.grid} style={{ marginTop: 20 }}>
    <section className={styles.card} aria-labelledby="setup-title">
      <span className={styles.badge}>{es ? "Solo estimación / no guarda" : "Estimate only / not saved"}</span>
      <h2 id="setup-title">{es ? "Presupuesto de implementación" : "Implementation estimate"}</h2>
      <p>{es ? "Introduce todos los costos, incluso si alguno es cero. El margen no se calcula con información desconocida." :
        "Enter every cost, including zero amounts. Unknown costs never produce a margin."}</p>
      <div className={styles.form}>
        <div className={styles.formGrid}>
          {setupFields.map(({key,label}) => <label key={key}>{label}
            <input inputMode="decimal" autoComplete="off" value={setup[key]} onChange={e =>
              setSetup(previous => ({...previous,[key]:e.target.value}))} placeholder="—" />
          </label>)}
        </div>
        <div aria-live="polite">
          {quote.status === "ready" ? <>
            <p><strong>{es ? "Costo total" : "Total cost"}:</strong> {money(quote.costCents, lang)}</p>
            <p><strong>{es ? "Beneficio bruto estimado" : "Estimated gross profit"}:</strong> {money(quote.profitCents, lang)}</p>
            <p><strong>{es ? "Margen estimado" : "Estimated margin"}:</strong> {quote.marginPercent.toFixed(2)} %</p>
            <p><strong>{es ? "Precio mínimo para margen objetivo" : "Minimum price for target margin"}:</strong> {money(quote.minimumPriceCents, lang)}</p>
          </> : <p role="status">{quote.status === "invalid"
              ? (es ? "Datos inválidos o exceden los límites permitidos." : "Invalid inputs or limits exceeded.")
              : (es ? "SIN DATOS: completa todos los campos." : "NO DATA: complete every field.")}</p>}
        </div>
      </div>
      <p className={styles.note}>{es ? "No incluye impuestos ni gastos no declarados. No crea ni modifica cotizaciones reales." :
        "Taxes and undeclared costs are excluded. No quote is created or changed."}</p>
    </section>
    <section className={styles.card} aria-labelledby="commission-title">
      <span className={styles.badge}>{es ? "No es una factura" : "Not an invoice"}</span>
      <h2 id="commission-title">{es ? "Simulador de comisión" : "Commission simulator"}</h2>
      <p>{es ? "Una comisión calculada nunca se marca como pagada sin conciliación. La legalidad y el contrato requieren revisión independiente." :
        "A calculated fee is never marked paid without reconciliation. Legal and contractual review is separate."}</p>
      <div className={styles.form}>
        <div className={styles.formGrid}>
          {commissionFields.map(({key,label}) => <label key={key}>{label}
            <input inputMode="decimal" autoComplete="off" value={commission[key]} onChange={e =>
              setCommission(previous => ({...previous,[key]:e.target.value}))} placeholder="—" />
          </label>)}
        </div>
        {conditions.map(({key,label}) => <label key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" style={{ minHeight: 20, width: 20 }} checked={commission[key]}
            onChange={e => setCommission(previous => ({...previous,[key]:e.target.checked}))} /> {label}
        </label>)}
        <div aria-live="polite">
          {fee.status === "eligible" || fee.status === "pending" ? <>
            <p><strong>{es ? "Base elegible hipotética" : "Hypothetical eligible base"}:</strong> {money(fee.baseCents, lang)}</p>
            <p><strong>{es ? "Comisión calculada" : "Calculated commission"}:</strong> {money(fee.estimatedCents, lang)}</p>
            <p><strong>{es ? "Exigible según validaciones ingresadas" : "Eligible from entered checks"}:</strong> {fee.eligibleCents === null ? "—" : money(fee.eligibleCents, lang)}</p>
            <p>{fee.status === "pending" ? (es ? "PENDIENTE: faltan verificaciones." : "PENDING: verification incomplete.") :
              (es ? "Elegibilidad simulada. Sin factura ni cobro." : "Simulated eligibility. Not invoiced or collected.")}</p>
          </> : <p role="status">{fee.status === "invalid" ? (es ? "Datos no válidos." : "Invalid values.") :
              (es ? "SIN DATOS: completa los importes." : "NO DATA: complete amounts.")}</p>}
        </div>
      </div>
      <p className={styles.note}>{es ? "Marcar las casillas aquí solo simula evidencia; no verifica documentos externos ni autoriza comisiones." :
        "Checking boxes only simulates evidence; it does not verify documents or authorize a fee."}</p>
    </section>
  </div>;
}
