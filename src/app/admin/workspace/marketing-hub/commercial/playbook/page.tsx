import Link from "next/link";
import {Suite} from "@/components/suite/suite";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import {SALES_PHASES,INDUSTRY_DISCOVERY} from "@/lib/commercial/operations";
import styles from "../../growth/growth.module.css";
export const dynamic="force-dynamic";
export default async function PlaybookPage(){
 await requireOwner();const lang=await getLang();
 return <Suite active="marketing-hub"><main className={styles.page}>
 <header className={styles.hero}><span className={styles.eyebrow}>Commercial Foundation / Operations</span>
 <h1>{pick(lang,"Manual comercial y onboarding","Sales playbook and onboarding")}</h1>
 <p>{pick(lang,"Checklist de referencia: las actividades y contratos reales permanecen en CRM.","Reference checklist: actual CRM activities and contracts remain in CRM.")}</p>
 <nav className={styles.toolbar}><Link href="/admin/workspace/crm/desk">CRM Desk</Link><Link href="/admin/workspace/marketing-hub/commercial">Commercial Foundation</Link></nav></header>
 <section className={styles.section} aria-labelledby="phases-title"><h2 id="phases-title">{pick(lang,"Seis fases del proceso","Six operating phases")}</h2>
 <div className={styles.grid}>{SALES_PHASES.map(p=><article key={p.key} className={styles.card}>
 <h3>{pick(lang,...p.title)}</h3><ul>{p.checks.map((x,i)=><li key={i}>{pick(lang,...x)}</li>)}</ul></article>)}</div></section>
 <section className={styles.section} aria-labelledby="questions-title"><h2 id="questions-title">{pick(lang,"Preguntas de descubrimiento","Discovery questions")}</h2>
 <div className={styles.grid}>{INDUSTRY_DISCOVERY.map(p=><article key={p.key} className={styles.card}><h3>{pick(lang,...p.title)}</h3><ul>{p.questions.map((q,i)=><li key={i}>{pick(lang,...q)}</li>)}</ul></article>)}</div></section>
 <p className={styles.note}>{pick(lang,"Este manual no crea registros, no omite el control de contrato firmado y no cambia las 13 etapas del CRM.","This guide creates no records, bypasses no signed-contract gates and does not change the CRM's 13 stages.")}</p></main></Suite>;
}
