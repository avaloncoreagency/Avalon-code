import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { OFFERS } from "@/lib/commercial/catalog";
import styles from "../../growth/growth.module.css";
export const dynamic="force-dynamic";
export default async function CommercialCatalogPage(){
 await requireOwner();
 const lang=await getLang();
 return <Suite active="marketing-hub"><main className={styles.page}>
 <header className={styles.hero}>
  <span className={styles.eyebrow}>Commercial Foundation / Catalog</span>
  <h1>{pick(lang,"Catálogo comercial interno","Internal commercial catalog")}</h1>
  <p>{pick(lang,"Las tarifas son propuestas para Miguel y Samuel. No son productos aprobados ni precios publicados.","Rates are owner-only proposals, not approved or published prices.")}</p>
  <nav className={styles.toolbar} aria-label="Commercial Foundation"><Link href="/admin/workspace/marketing-hub/commercial">{pick(lang,"Estimador","Estimator")}</Link><Link href="/admin/workspace/crm/sales">{pick(lang,"Ventas reales","Real sales")}</Link></nav>
 </header>
 <section className={styles.section} aria-labelledby="catalog-title">
  <h2 id="catalog-title">{pick(lang,"Seis productos","Six products")}</h2>
  <div className={styles.grid}>{OFFERS.map(offer=><article className={styles.card} key={offer.id}>
   <span className={styles.badge}>{pick(lang,"PROPUESTA · pendiente de aprobar","PROPOSAL · approval pending")}</span>
   <h3>{pick(lang,...offer.name)}</h3><p>{pick(lang,...offer.description)}</p>
   <h4>Starter</h4><ul>{offer.starter.map((b,i)=><li key={i}>{pick(lang,...b)}</li>)}</ul>
   <p>{pick(lang,"Instalación sugerida","Suggested setup")}: <strong>USD {offer.pricing.setupStarter}</strong></p>
   <p>{pick(lang,"Mensualidad sugerida","Suggested monthly")}: <strong>USD {offer.pricing.monthlyStarter}</strong></p>
   <h4>Growth</h4><ul>{offer.growth.map((b,i)=><li key={i}>{pick(lang,...b)}</li>)}</ul>
   <p>{pick(lang,"Instalación sugerida","Suggested setup")}: <strong>USD {offer.pricing.setupGrowth}</strong></p>
   <p>{pick(lang,"Mensualidad sugerida","Suggested monthly")}: <strong>USD {offer.pricing.monthlyGrowth}</strong></p>
   <h4>{pick(lang,"Exclusiones","Exclusions")}</h4><ul>{offer.exclusions.map((b,i)=><li key={i}>{pick(lang,...b)}</li>)}</ul>
   <p className={styles.note}>{pick(lang,"Custom se cotiza individualmente. Consumos, impuestos y terceros van aparte.","Custom is quoted individually. Usage, taxes and third parties are separate.")}</p>
  </article>)}</div>
 </section>
 <p className={styles.note}>{pick(lang,"La fuente de verdad de servicios aprobados sigue siendo CRM Service Factory. Esta página es solo asesoría interna.","Approved service records remain in CRM Service Factory. This page is internal guidance only.")}</p>
 </main></Suite>;
}
