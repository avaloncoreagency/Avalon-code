import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { estimateByCadence, showUsd, type BillingCycle } from "@/lib/service-factory/planner";
import s from "./proposal.module.css";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Plan = {
  id: string; title: string; client_id: string | null; objective: string;
  currency: string; status: string; crm_clients: { legal_name: string } | null;
};
type PlanLine = {
  id: string; name_snapshot: string; position: number;
  quantity: number; unit_price: string | null;
  billing_type: BillingCycle; scope_snapshot: string;
};

const cadenceName = (lang: "es" | "en", cadence: BillingCycle) =>
  cadence === "monthly" ? pick(lang, "Mensual", "Monthly") :
  cadence === "annual" ? pick(lang, "Anual", "Annual") :
  pick(lang, "Pago unico", "One-time");

export default async function ProposalPreview({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const lang = await getLang();
  const [plan, lines] = await Promise.all([
    run<Plan | null>(supabase.from("crm_solution_plans")
      .select("id,title,client_id,objective,currency,status,crm_clients(legal_name)").eq("id", id).maybeSingle()),
    run<PlanLine[]>(supabase.from("crm_solution_plan_lines")
      .select("id,name_snapshot,position,quantity,unit_price,billing_type,scope_snapshot")
      .eq("plan_id", id).order("position")),
  ]);
  if (!plan.error && !plan.data) notFound();
  const ready = !plan.error && !lines.error && plan.data?.status === "reviewed";
  // Reuse the canonical calculation; pass NO internal costs or hours to the view.
  const totals = ready
    ? estimateByCadence((lines.data ?? []).map(item => ({
        billing_type: item.billing_type, quantity: item.quantity,
        unit_price: item.unit_price, direct_cost: null, estimated_hours: null,
      })), null, "0")
    : [];

  return <main className={s.page}>
    <nav className={s.toolbar} aria-label={pick(lang, "Navegacion interna", "Internal navigation")}>
      <Link href={"/admin/service-factory/planner/" + id}>{pick(lang, "Volver al presupuesto", "Back to estimate")}</Link>
      <span>{pick(lang, "Para imprimir: usa la opcion Imprimir de tu navegador.", "To print: use the browser Print command.")}</span>
    </nav>
    <p className={s.eyebrow}>AVALON CORE AGENCY</p>
    <h1>{pick(lang, "Vista previa de propuesta comercial", "Commercial proposal preview")}</h1>
    <p className={s.notice} role="status">{pick(lang,
      "DOCUMENTO INTERNO · No enviado al cliente. Revisar datos y condiciones antes de compartir.",
      "INTERNAL DOCUMENT · Not sent to the client. Review all details and terms before sharing.")}</p>
    {plan.error || lines.error
      ? <p className={s.alert} role="alert">{pick(lang,
          "No se puede consultar el presupuesto en este entorno. No se ha generado ninguna propuesta.",
          "The estimate is unavailable in this environment. No proposal has been generated.")}</p>
      : !ready
        ? <p className={s.alert} role="alert">{pick(lang,
            "Este presupuesto no ha sido revisado internamente. No hay propuesta lista para compartir.",
            "This estimate has not been internally reviewed. No proposal is ready to share.")}</p>
        : plan.data && <>
          <section className={s.intro}>
            <div><small>{pick(lang, "Cliente", "Client")}</small><strong>{plan.data.crm_clients?.legal_name ??
              pick(lang, "Cliente por definir", "Client not assigned")}</strong></div>
            <div><small>{pick(lang, "Moneda", "Currency")}</small><strong>{plan.data.currency}</strong></div>
          </section>
          <h2>{plan.data.title}</h2>
          {plan.data.objective && <section className={s.section}>
            <h3>{pick(lang, "Objetivo", "Objective")}</h3>
            <p className={s.scope}>{plan.data.objective}</p>
          </section>}
          {totals.map(group => <section key={group.billing_type} className={s.section}>
            <h3>{cadenceName(lang, group.billing_type)}</h3>
            <table className={s.table}>
              <thead><tr>
                <th>{pick(lang, "Servicio y alcance", "Service and scope")}</th>
                <th>{pick(lang, "Cantidad", "Qty")}</th>
                <th>{pick(lang, "Precio unitario", "Unit price")}</th>
              </tr></thead>
              <tbody>{(lines.data ?? []).filter(line => line.billing_type === group.billing_type).map(line =>
                <tr key={line.id}>
                  <td><strong>{line.name_snapshot}</strong>
                    {line.scope_snapshot && <p className={s.scope}>{line.scope_snapshot}</p>}</td>
                  <td>{line.quantity}</td>
                  <td>{line.unit_price === null ? pick(lang, "Sin precio", "Price unavailable")
                    : showUsd(Math.round(Number(line.unit_price) * 100), lang)}</td>
                </tr>)}</tbody>
            </table>
            <p className={s.total}>{pick(lang, "Total por frecuencia", "Total for this cadence")}: <strong>
              {showUsd(group.revenueCents, lang)}</strong></p>
          </section>)}
          <p className={s.footer}>{pick(lang,
            "Los importes de pago unico, mensual y anual son independientes. Impuestos, fechas, condiciones de pago y aceptacion del cliente requieren confirmacion humana. No constituye contrato, factura ni venta.",
            "One-time, monthly and annual amounts are separate. Taxes, dates, payment terms and client acceptance require human confirmation. This is not a contract, invoice or sale.")}</p>
        </>}
  </main>;
}
