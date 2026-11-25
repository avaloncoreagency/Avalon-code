import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { APPROVAL_LABEL, LIBRARY, documentById, ownerCatalog, type LibraryDoc } from "@/lib/docs/library";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";

/**
 * CRM → Biblioteca documental. OWNERS ONLY (requireOwner). Shows every department document (Employee Welcome Package,
 * client welcome/onboarding/manuals/e-mails/delivery) with version, languages, audience, approval state and sha256.
 * Pending documents are never distributed: sellers and clients only ever receive APPROVED ones (see lib/docs/library).
 */
export default async function DocumentLibrary({ searchParams }: { searchParams: Promise<Query> }) {
  await requireOwner();
  const lang = await getLang(); const p = await searchParams;
  const t = (es: string, en: string) => pick(lang, es, en);
  const selected = documentById(q(p, "doc") ?? "");
  const cat = ownerCatalog();
  const row = (d: LibraryDoc) => <li key={d.id} data-library-doc={d.id} data-approval={d.approval} style={{ display: "block" }}>
    <Link href={`/admin/workspace/crm/documents?doc=${encodeURIComponent(d.id)}#doc`}><strong>{d.id}</strong> · {d.title}</Link>
    <br /><small className={s.muted}>v{d.version} · {d.languages.join("/").toUpperCase()} · {d.service === "all" ? t("todos los servicios", "all services") : d.service} · </small>
    <span className={s.tag} data-tone={d.approval === "approved" ? "ok" : "warn"}>{pick(lang, ...APPROVAL_LABEL[d.approval])}</span></li>;
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="clients" eyebrow={t("CRM / Biblioteca documental", "CRM / Document library")} title={t("Biblioteca documental", "Document library")}
      lead={t("Paquete de bienvenida de empleados y documentación de clientes preparados por los departamentos. Solo lo aprobado por Miguel y Samuel se distribuye.",
        "Employee welcome package and client documentation prepared by the departments. Only what Miguel and Samuel approve is distributed.")} />
    <p className={s.flash} data-tone="warn" role="status">{t("La aprobación se registra en el manifiesto de cada paquete mediante un PR revisado. Ningún documento de esta biblioteca otorga autoridad comercial ni efecto legal por sí mismo; los acuerdos jurídicos requieren revisión de un abogado.",
      "Approval is recorded in each pack's manifest through a reviewed PR. No document here grants commercial authority or legal effect by itself; legal agreements require attorney review.")}</p>
    <div className={s.split}>
      <section className={s.panel} aria-labelledby="lib-staff">
        <header><h2 id="lib-staff">{t("Empleados y vendedores", "Employees & sellers")}</h2><small className={s.muted}>{LIBRARY.packs.sales.manifest} · {LIBRARY.packs.sales.state}</small></header>
        <ul className={s.list}>{cat.sales.map(row)}</ul>
      </section>
      <section className={s.panel} aria-labelledby="lib-client">
        <header><h2 id="lib-client">{t("Clientes", "Clients")}</h2><small className={s.muted}>{LIBRARY.packs.client.manifest} · {LIBRARY.packs.client.state}</small></header>
        <ul className={s.list}>{cat.client.map(row)}</ul>
      </section>
    </div>
    {selected && <section className={s.panel} aria-labelledby="doc-title" id="doc" data-library-selected={selected.id}>
      <header><h2 id="doc-title">{selected.id} · {selected.title}</h2></header>
      <p className={s.muted}>v{selected.version} · {selected.languages.join("/").toUpperCase()} · {t("Audiencia", "Audience")}: {selected.audience === "staff" ? t("empleados", "staff") : t("clientes", "clients")} · {t("Estado del manifiesto", "Manifest state")}: {selected.approvalLabel}
        <br />{t("Fuente", "Source")}: <code>{selected.source}</code> · sha256 <code>{selected.sha256.slice(0, 16)}…</code></p>
      <p><a className={s.button} href={`/admin/workspace/crm/documents/${encodeURIComponent(selected.id)}`} download data-library-pdf>{t("Descargar PDF", "Download PDF")}</a></p>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit", lineHeight: 1.6, maxHeight: "70vh", overflowY: "auto", margin: 0 }}>{selected.content}</pre>
    </section>}
  </div></Suite>;
}
