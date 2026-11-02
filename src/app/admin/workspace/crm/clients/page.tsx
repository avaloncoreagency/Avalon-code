import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { createClientRecord } from "./actions";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Client = { id: string; client_code: string; legal_name: string; trade_name: string; industry: string; location: string; status: string; owner_id: string; updated_at: string; crm_sales: { id: string }[]; os_projects: { id: string; status: string }[] };
const PAGE = 30;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const search = (q(p, "q") ?? "").trim().slice(0, 80);
  const page = Math.min(Number(/^\d{1,4}$/.test(q(p, "page") ?? "") ? q(p, "page") : 0), 2000);
  let query = supabase.from("crm_clients").select("id,client_code,legal_name,trade_name,industry,location,status,owner_id,updated_at,crm_sales(id),os_projects(id,status)", { count: "exact" });
  // PostgREST filter values are escaped by quoting; strip characters with filter meaning.
  const safe = search.replace(/[%_,()*\\"]/g, " ").trim();
  if (safe) query = query.or(`legal_name.ilike."%${safe}%",trade_name.ilike."%${safe}%",client_code.ilike."%${safe}%"`);
  if (q(p, "archived") !== "1") query = query.neq("status", "archived");
  const [clients, owners] = await Promise.all([
    run<Client[]>(query.order("updated_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
  ]);
  const next = (n: number) => `?${new URLSearchParams({ ...(safe ? { q: safe } : {}), page: String(n) })}`;
  return <Suite active="crm"><main className={s.hud}>
    <OpsHeader lang={lang} active="clients" eyebrow="CRM / Clientes" title={pick(lang, "Clientes 360°", "Clients 360°")}
      lead={pick(lang, "Cada empresa tiene una ficha única con su identidad, contactos, ventas, proyectos por departamento, tareas e historial.", "Every company has one profile with identity, contacts, sales, departmental projects, tasks and history.")}
      actions={<Link className={`${s.button} ${s.primary}`} href="/admin/workspace/crm/sales/new">{pick(lang, "+ Registrar venta", "+ Record sale")}</Link>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    <div className={s.columns}>
      <section className={s.panel} aria-labelledby="clients"><header><h2 id="clients">{pick(lang, "Empresas", "Companies")}</h2>
        <form className={s.toolbar} role="search"><label>{pick(lang, "Buscar por nombre o código", "Search by name or code")}<input name="q" defaultValue={search} maxLength={80} /></label><button className={s.button}>{pick(lang, "Buscar", "Search")}</button></form></header>
        {clients.error ? <Unavailable lang={lang} code={clients.error} /> : clients.data.length === 0 ? <p className={s.empty}>{pick(lang, "Sin clientes todavía. Se crean al registrar una venta o desde el formulario.", "No clients yet. They are created when recording a sale or with the form.")}</p> :
        <div className={s.grid}>{clients.data.map(c => <Link key={c.id} href={`/admin/workspace/crm/clients/${c.id}`} className={s.card}>
          <span className={s.muted}>{c.client_code}</span><h3>{c.legal_name}</h3>
          <p className={s.muted}>{[c.trade_name, c.industry, c.location].filter(Boolean).join(" · ") || "—"}</p>
          <p className={s.inline}><Tag lang={lang} value={c.status} /><span className={s.tag}>{c.crm_sales.length} {pick(lang, "venta(s)", "sale(s)")}</span><span className={s.tag}>{c.os_projects.filter(x => x.status === "active").length} {pick(lang, "proyecto(s) activos", "active project(s)")}</span></p>
          <small className={s.muted}>{pick(lang, "Responsable", "Owner")}: {ownerName(owners.data ?? [], c.owner_id)} · {formatDate(lang, c.updated_at)}</small>
        </Link>)}</div>}
        <div className={s.actions} style={{ marginTop: 12 }}>{page > 0 && <Link className={s.button} href={next(page - 1)}>{pick(lang, "Anterior", "Previous")}</Link>}{(page + 1) * PAGE < (clients.count ?? 0) && <Link className={s.button} href={next(page + 1)}>{pick(lang, "Siguiente", "Next")}</Link>}</div>
      </section>
      <section className={s.panel} aria-labelledby="new-client"><h2 id="new-client">{pick(lang, "Nuevo cliente sin venta", "New client without a sale")}</h2>
        <form action={createClientRecord} className={s.form}>
          <label className={s.field}>{pick(lang, "Nombre de empresa *", "Company name *")}<input name="legal_name" required maxLength={200} /></label>
          <div className={s.row}><label className={s.field}>{pick(lang, "Nombre comercial", "Trade name")}<input name="trade_name" maxLength={200} /></label><label className={s.field}>Web<input name="website" type="url" placeholder="https://" maxLength={500} /></label></div>
          <div className={s.row}><label className={s.field}>{pick(lang, "Industria", "Industry")}<input name="industry" maxLength={120} /></label><label className={s.field}>{pick(lang, "País", "Country")}<input name="country" maxLength={80} /></label></div>
          <div className={s.row}><label className={s.field}>{pick(lang, "Ubicación", "Location")}<input name="location" maxLength={200} /></label><label className={s.field}>{pick(lang, "Fuente", "Source")}<input name="source" maxLength={200} /></label></div>
          <label className={s.field}>{pick(lang, "Notas", "Notes")}<textarea name="notes" maxLength={4000} rows={3} /></label>
          <button className={s.button}>{pick(lang, "Crear cliente", "Create client")}</button>
          <p className={s.muted}>{pick(lang, "Si ya existe una empresa con ese nombre, no se duplica.", "If a company with that name exists, it is not duplicated.")}</p>
        </form>
      </section>
    </div>
  </main></Suite>;
}
