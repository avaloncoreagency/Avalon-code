import Link from "next/link";
import {Suite} from "@/components/suite/suite";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import {CAMPAIGN_BRIEFS} from "@/lib/commercial/campaigns";
import styles from "../../growth/growth.module.css";
export const dynamic="force-dynamic";
export default async function CampaignsBriefPage(){
 await requireOwner();const lang=await getLang();
 return <Suite active="marketing-hub"><main className={styles.page}>
 <header className={styles.hero}><span className={styles.eyebrow}>Commercial Foundation / Growth</span>
 <h1>{pick(lang,"Conceptos de campañas","Campaign concepts")}</h1>
 <p>{pick(lang,"Material interno sin anuncios publicados, prospectos creados ni gastos.","Internal content only: no published ads, generated leads or spending.")}</p>
 <nav className={styles.toolbar}><Link href="/admin/workspace/marketing-hub/growth">Growth Hub</Link><Link href="/admin/workspace/marketing-hub/commercial">Commercial Foundation</Link></nav></header>
 <section className={styles.section} aria-labelledby="campaign-title"><h2 id="campaign-title">{pick(lang,"Borradores iniciales","Initial drafts")}</h2>
 <div className={styles.grid}>{CAMPAIGN_BRIEFS.map(c=><article key={c.id} className={styles.card}>
 <span className={styles.badge}>{c.audience==="contractor_b2c"?pick(lang,"BLOQUEADO · B2C no conectado","BLOCKED · B2C not connected"):pick(lang,"BORRADOR B2B","B2B DRAFT")}</span>
 <h3>{lang==="es"?c.es.headline:c.en.headline}</h3><p>{lang==="es"?c.es.body:c.en.body}</p><p><strong>CTA:</strong> {lang==="es"?c.es.cta:c.en.cta}</p>
 <p className={styles.note}>{c.target}</p><p className={styles.note}>{c.privacyWarning}</p>
 </article>)}</div></section></main></Suite>;
}
