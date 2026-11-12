import Link from "next/link";
import {Suite} from "@/components/suite/suite";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import {INDUSTRY_KNOWLEDGE} from "@/lib/commercial/knowledge";
import styles from "../../growth/growth.module.css";
export const dynamic="force-dynamic";
export default async function KnowledgePage(){
 await requireOwner();const lang=await getLang();
 return <Suite active="marketing-hub"><main className={styles.page}>
 <header className={styles.hero}><span className={styles.eyebrow}>Commercial Foundation / AI</span>
 <h1>{pick(lang,"Guías de conocimiento IA","AI knowledge guides")}</h1>
 <p>{pick(lang,"Plantillas de preparación, no fuentes publicadas. Un asistente solo podrá usar datos aprobados y aislados por cliente.","Preparation templates, not published knowledge. Assistants may only use approved client-isolated sources.")}</p>
 <nav className={styles.toolbar}><Link href="/admin/workspace/ai-communications">AI Communications Hub</Link><Link href="/admin/workspace/marketing-hub/commercial">Commercial Foundation</Link></nav></header>
 <section className={styles.section} aria-labelledby="ai-title"><h2 id="ai-title">{pick(lang,"Ocho industrias iniciales","Eight starting industries")}</h2>
 <div className={styles.grid}>{INDUSTRY_KNOWLEDGE.map(industry=><article key={industry.key} className={styles.card}><span className={styles.badge}>{pick(lang,"NO PUBLICADO","NOT PUBLISHED")}</span><h3>{industry.name}</h3>
 <ul>{industry.topics.map(topic=><li key={topic}>{topic}</li>)}</ul>
 <p className={styles.note}>{industry.warning}</p></article>)}</div></section>
 <p className={styles.note}>{pick(lang,"No hay carga a proveedores, grabación, memoria compartida entre clientes ni respuestas automáticas desde esta página.","No provider requests, recording, cross-client memory or automatic answers from this page.")}</p></main></Suite>;
}
