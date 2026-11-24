import { readInboxLocation } from "@/lib/crm/inbound-location";
import { Suite } from "@/components/suite/suite";
import { OpsHeader } from "@/components/sales/ui";
import { InboundInbox } from "@/components/crm/inbound-inbox";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";
export default async function InboundPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const params=await searchParams;
  const navigation=new URLSearchParams();
  for(const key of ["q","status","focus","page"]) if(typeof params[key]==="string") navigation.set(key,params[key] as string);
  const initial=readInboxLocation(navigation);
  await requireOwner();
  const lang = await getLang();
  return <Suite active="crm"><section className={s.hud}>
    <OpsHeader active="inbound" lang={lang} eyebrow="CRM · Inbound" title={pick(lang,"Solicitudes comerciales","Inbound inquiries")}
      lead={pick(lang,"Consultas voluntarias del website. Revisarlas no crea clientes ni ventas por sí solo.","Voluntary website inquiries. Reviewing them does not create clients or sales by itself.")} />
    <InboundInbox lang={lang} initial={initial}/>
  </section></Suite>;
}
