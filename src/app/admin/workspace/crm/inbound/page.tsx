import { Suite } from "@/components/suite/suite";
import { OpsHeader } from "@/components/sales/ui";
import { InboundInbox } from "@/components/crm/inbound-inbox";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";
export default async function InboundPage() {
  await requireOwner();
  const lang = await getLang();
  return <Suite active="crm"><section className={s.hud}>
    <OpsHeader active="inbound" lang={lang} eyebrow="CRM · Inbound" title={pick(lang,"Solicitudes comerciales","Inbound inquiries")}
      lead={pick(lang,"Consultas voluntarias del website. Revisarlas no ejecuta Radar ni crea clientes o ventas.","Voluntary website inquiries. Reviewing them does not run Radar or create clients or sales.")} />
    <InboundInbox lang={lang}/>
  </section></Suite>;
}
