import Link from "next/link";
import {Suite} from "@/components/suite/suite";
import {requireOwner} from "@/lib/auth/session";
import {getLang} from "@/lib/i18n-server";
import {pick} from "@/lib/i18n";
import RouterPreview from "./router-preview";
import styles from "../../growth/growth.module.css";
export const dynamic="force-dynamic";
export default async function RouterPage(){
 await requireOwner();const lang=await getLang();
 return <Suite active="marketing-hub"><main className={styles.page}>
  <header className={styles.hero}><span className={styles.eyebrow}>Commercial Foundation / Lead Router</span>
   <h1>{pick(lang,"Simulador de elegibilidad B2C","B2C eligibility simulator")}</h1>
   <p>{pick(lang,
    "Introduce únicamente datos sintéticos: esta prueba local no envía consumidores, no guarda registros y no certifica licencias ni contratos reales.",
    "Synthetic values only: this local policy check does not route consumers, save records or verify real contractor licenses or contracts.")}</p>
   <nav className={styles.toolbar}><Link href="/admin/workspace/marketing-hub/commercial">Commercial Foundation</Link><Link href="/admin/workspace/marketing-hub/commercial/campaigns">Campaign drafts</Link></nav>
  </header>
  <RouterPreview lang={lang}/>
 </main></Suite>;
}
