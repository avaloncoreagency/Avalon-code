import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, pick, type Lang } from "@/lib/i18n";
import { money } from "@/lib/sales/domain";
import s from "@/components/sales/sales.module.css";

const PAGE_SIZE = 25;
const labels: Readonly<Record<string, readonly [string, string]>> = {
  confirmed: ["Venta registrada", "Sale recorded"],
  agreed: ["Comisión acordada", "Commission agreed"],
  accrued: ["Comisión devengada", "Commission accrued"],
  paid: ["Comisión pagada", "Commission paid"],
  cancelled: ["Cancelada", "Cancelled"],
};

type CommercialRecord = {
  record_kind: "sale" | "commission";
  record_id: string;
  sale_number: string | null;
  recorded_on: string;
  status: string;
  amount: string | null;
  currency: string | null;
  has_commission_agreement: boolean | null;
};

export async function StaffCommercialHistory({
  supabase, lang, pageParam, view, day,
}: {
  supabase: SupabaseClient;
  lang: Lang;
  pageParam?: string;
  view: string;
  day: string;
}) {
  const page = pageParam && /^\d{1,5}$/.test(pageParam) ? Number(pageParam) : 0;
  const { data, error } = await supabase.rpc("staff_own_commercial_history", { p_page: page });
  const records = (data ?? []) as CommercialRecord[];
  const to = (target: number) => `/staff?${new URLSearchParams({ view, d: day, commercial: String(target) })}#staff-commercial`;
  const t = (es: string, en: string) => pick(lang, es, en);

  return <section className={s.panel} aria-labelledby="staff-commercial">
    <h2 id="staff-commercial">{t("Mis ventas y comisiones", "My sales and commissions")}</h2>
    {error ? <p role="alert">{t("Historial comercial no disponible.", "Commercial history unavailable.")}</p> :
      records.length === 0 ? <p className={s.empty}>{t("No hay registros comerciales en esta página.", "There are no commercial records on this page.")}</p> :
      <ul className={s.list}>{records.slice(0, PAGE_SIZE).map(record => {
        const label = Object.hasOwn(labels, record.status) ? t(...labels[record.status]) : t("Estado no disponible", "Status unavailable");
        return <li key={record.record_kind + record.record_id} className={s.notice}>
          <strong>{record.sale_number || t("Comisión", "Commission")}</strong>
          <p>{label} · {formatDate(lang, record.recorded_on)}
            {record.amount && record.currency && <> · {money(lang, record.amount, record.currency)}</>}
          </p>
          {record.record_kind === "sale" && record.status === "confirmed" && record.has_commission_agreement === false &&
            <p className={s.muted}>{t("Comisión pendiente de definición", "Commission terms pending")}</p>}
        </li>;
      })}</ul>}
    {!error && (page > 0 || records.length > PAGE_SIZE) &&
      <nav className={s.actions} aria-label={t("Páginas del historial comercial", "Commercial history pages")}>
        {page > 0 && <Link className={s.button} href={to(page - 1)}>{t("Anterior", "Previous")}</Link>}
        {records.length > PAGE_SIZE && page < 99999 && <Link className={s.button} href={to(page + 1)}>{t("Siguiente", "Next")}</Link>}
      </nav>}
  </section>;
}
