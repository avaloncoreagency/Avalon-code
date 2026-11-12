import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import CommercialCalculator from "./commercial-calculator";
import styles from "../growth/growth.module.css";

export const dynamic = "force-dynamic";

/** Owner-only tools; does not query, mutate or publish commercial records. */
export default async function CommercialFoundationPage() {
  await requireOwner();
  const lang = await getLang();
  return <Suite active="marketing-hub">
    <main className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.eyebrow}>Avalon / Commercial Foundation</span>
        <h1>{pick(lang, "Estimación comercial interna", "Internal commercial estimates")}</h1>
        <p>{pick(lang,
          "Calcula costos, márgenes y posibles comisiones antes de aprobar una propuesta. No guarda datos, no crea ventas ni comisiones y no activa servicios de pago.",
          "Estimate costs, margins and potential commissions before reviewing a proposal. Nothing is saved, sold, invoiced or published.")}</p>
        <nav className={styles.toolbar} aria-label={pick(lang, "Navegación comercial", "Commercial navigation")}>
          <Link href="/admin/workspace/marketing-hub/growth">{pick(lang, "Volver a Growth", "Back to Growth")}</Link>
          <Link href="/admin/workspace/crm/sales">{pick(lang, "Ventas reales", "Real sales")}</Link>
          <Link href="/admin/workspace/marketing-hub/funnels">Funnels</Link>
        </nav>
      </header>
      <CommercialCalculator lang={lang} />
      <section className={styles.section} aria-labelledby="policy-title">
        <h2 id="policy-title">{pick(lang, "Controles comerciales", "Commercial safeguards")}</h2>
        <div className={styles.grid}>
          <article className={styles.card}>
            <span className={styles.badge}>{pick(lang, "No aprobado", "Not approved")}</span>
            <h3>{pick(lang, "Tarifario y catálogo", "Catalog and pricing")}</h3>
            <p>{pick(lang,
              "Los precios Starter/Growth de Commercial Foundation son propuestas internas, no SKU vendibles. Service Factory y el CRM siguen siendo las fuentes de verdad.",
              "Starter/Growth prices are internal proposals, not sellable SKUs. Service Factory and the CRM remain the sources of truth.")}</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>{pick(lang, "Sin asignaciones reales", "No live routing")}</span>
            <h3>Lead Router B2C</h3>
            <p>{pick(lang,
              "Se incorporó una política de elegibilidad que falla de forma segura. El envío real a contratistas permanece desactivado hasta contar con aislamiento, consentimiento y contratos verificados.",
              "A fail-closed eligibility policy has been added. Live contractor delivery remains disabled pending isolation, consent and verified contracts.")}</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>{pick(lang, "Sin estadísticas inventadas", "No fabricated statistics")}</span>
            <h3>{pick(lang, "Indicadores", "Metrics")}</h3>
            <p>{pick(lang,
              "Las fórmulas de conversión y costo por lead requieren fuentes completas y verificadas. No se equipara facturación de contratistas con ingresos de Avalon.",
              "Conversion and CPL require complete verified sources. Contractor sales are not treated as Avalon revenue.")}</p>
          </article>
          <article className={styles.card}>
            <span className={styles.badge}>{pick(lang, "Revisión humana", "Human review")}</span>
            <h3>{pick(lang, "Contratos y comisiones", "Contracts and commissions")}</h3>
            <p>{pick(lang,
              "Una comisión calculada no está automáticamente autorizada, facturada o cobrada. Las reglas legales y contractuales deben revisarse antes de operar.",
              "A calculated commission is not automatically authorized, invoiced or collected. Legal and contract review comes first.")}</p>
          </article>
        </div>
      </section>
    </main>
  </Suite>;
}
