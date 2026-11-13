import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { CommunicationsPortfolio } from "@/components/communications/communications-portfolio";
import { ModuleDeliveryPanel } from "@/components/os/module-delivery-panel";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { clientId, groupCompanies, type CompanyRecord } from "@/lib/os/client-hud";
import { createProject } from "@/app/admin/workspace/project-actions";
import { PROJECT_COLUMNS, countRows, run, type ProjectRow } from "@/lib/os/data";
import { DbNotice } from "@/components/os/ui";
import s from "@/components/communications/communications.module.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
type Params = { searchParams: Promise<Record<string,string|string[]|undefined>> };

/**
 * One private communications workspace, not separate sidebar modules.
 * Both agent types use existing os_projects and CRM lead references.
 * No provider connection or customer-facing activation is performed here.
 */
export default async function CommunicationHub({searchParams}:Params) {
  const {supabase} = await requireOwner();
  const lang = await getLang();
  const params = await searchParams;
  const raw = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isSafeInteger(raw) && raw >= 1 && raw <= 1000 ? raw : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const [projects, chatbotCount, receptionistCount, crmChoices, crmClients] = await Promise.all([
    run<ProjectRow[]>(supabase.from("os_projects")
      .select(PROJECT_COLUMNS,{count:"exact"})
      .in("module",["chatbots","receptionist"])
      .neq("status","archived")
      .order("updated_at",{ascending:false})
      .range(offset,offset + PAGE_SIZE - 1)),
    countRows(supabase,"os_projects",[["eq","module","chatbots"],["neq","status","archived"]]),
    countRows(supabase,"os_projects",[["eq","module","receptionist"],["neq","status","archived"]]),
    run<CompanyRecord[]>(supabase.from("crm_leads")
      .select("id,company,contact").eq("archived",false).order("company").limit(200)),
    run<{id:string;legal_name:string;trade_name:string;client_code:string}[]>(
      supabase.from("crm_clients").select("id,legal_name,trade_name,client_code")
        .neq("status","archived").order("legal_name").limit(200)),
  ]);

  const ids = [...new Set((projects.data ?? []).filter(p=>!p.client_id).map(p => clientId(p.settings)).filter((id):id is string => Boolean(id)))];
  const clientIds = [...new Set((projects.data??[]).map(p=>p.client_id).filter((id):id is string=>Boolean(id)))];
  const [companies,confirmed]=await Promise.all([
    ids.length ? run<CompanyRecord[]>(supabase.from("crm_leads").select("id,company,contact").in("id",ids).limit(PAGE_SIZE)) : null,
    clientIds.length ? run<{id:string;legal_name:string;trade_name:string}[]>(supabase.from("crm_clients").select("id,legal_name,trade_name").in("id",clientIds).limit(PAGE_SIZE)) : null,
  ]);
  const groups = groupCompanies(projects.data ?? [], [
    ...(companies?.data??[]),
    ...(confirmed?.data??[]).map(c=>({id:c.id,company:c.trade_name||c.legal_name})),
  ]);
  const linked = groups.filter(g => g.linked).length;
  const unlinked = groups.filter(g => !g.linked).reduce((total,g) => total + g.projects.length,0);
  const total = projects.count;
  const label = (es:string,en:string) => pick(lang,es,en);
  const number = (value:number|null|undefined) => value === null || value === undefined
    ? "—" : value.toLocaleString(lang==="es"?"es-ES":"en-US");

  return <Suite active="ai-communications">
    <div className={s.page}>
      <header className={s.hero}>
        <p className={s.eyebrow}>AVALON OS / AI COMMUNICATIONS</p>
        <h1>COMMUNICATION HUB</h1>
        <p>{label(
          "Tu centro privado para registrar y administrar agentes creados fuera de Avalon, organizados por empresa y referencia real del CRM.",
          "Your private workspace to register and manage externally built agents, grouped by company and real CRM reference.")}</p>
        <nav className={s.heroActions} aria-label={label("Acciones rápidas","Quick actions")}>
          <Link className={s.primaryButton} href="#new-agent">{label("Agregar agente externo","Add external agent")}</Link>
          <Link className={s.secondaryButton} href="#directory">{label("Ver empresas y agentes","Companies and agents")}</Link>
          <Link className={s.secondaryButton} href="/admin/workspace/crm/clients">{label("Clientes CRM","CRM clients")}</Link>
        </nav>
      </header>

      <section className={s.metrics} aria-label={label("Resumen de agentes","Agent overview")}>
        <div className={s.metric}><span>{label("Agentes registrados (sin archivar)","Registered agents (not archived)")}</span><strong>{number(total)}</strong></div>
        <div className={s.metric}><span>AI Receptionist</span><strong>{number(receptionistCount.count)}</strong></div>
        <div className={s.metric}><span>AI Chatbots</span><strong>{number(chatbotCount.count)}</strong></div>
        <div className={s.metric}><span>{label("Empresas vinculadas (esta página)","Linked companies (this page)")}</span><strong>{projects.error?"—":number(linked)}</strong></div>
      </section>

      {(projects.error || chatbotCount.error || receptionistCount.error || companies?.error || crmChoices.error) &&
        <div className={s.notice} role="alert">{label(
          "Algunos datos no están disponibles; se mantienen los registros existentes y no se inventan totales.",
          "Some data is unavailable; existing records are preserved and no totals are fabricated.")}
        </div>}
      {projects.error && <DbNotice lang={lang} error={projects.error} />}
      {companies?.error && <DbNotice lang={lang} error={companies.error} />}

      <section className={s.section} aria-labelledby="products-title">
        <div className={s.sectionHead}><div><h2 id="products-title">{label("Tus dos productos de comunicación","Your two communications products")}</h2>
          <p>{label("Cada agente tiene su configuración y su proyecto independientes.","Each agent has its own separate project and settings.")}</p></div></div>
        <div className={s.productGrid}>
          <article className={s.product}>
            <span className={s.productIcon}>01 / VOICE</span>
            <h3>AI Receptionist</h3>
            <p>{label("Organiza asistentes telefónicos por empresa, horarios, saludos, preguntas frecuentes y transferencia a una persona.","Organize telephone assistants per company, hours, greetings, FAQs and human handoff.")}</p>
            <nav className={s.productLinks} aria-label="AI Receptionist">
              <Link href="/admin/workspace/ai-receptionist">{label("Mis recepcionistas","My receptionists")}</Link>
              <Link href="#new-agent">{label("Registrar recepcionista","Register receptionist")}</Link>
            </nav>
          </article>
          <article className={`${s.product} ${s.productChatbot}`}>
            <span className={s.productIcon}>02 / CHAT</span>
            <h3>AI Chatbots</h3>
            <p>{label("Acumula chatbots web por cliente y edita instrucciones, personalidad, bienvenida y conocimiento guardado.","Keep web chatbots by client and edit instructions, personality, greetings and saved knowledge.")}</p>
            <nav className={s.productLinks} aria-label="AI Chatbots">
              <Link href="/admin/workspace/ai-chatbots">{label("Mis chatbots","My chatbots")}</Link>
              <Link href="#new-agent">{label("Registrar chatbot","Register chatbot")}</Link>
            </nav>
          </article>
        </div>
      </section>

      <section className={s.section} id="directory" aria-labelledby="directory-title">
        <div className={s.sectionHead}>
          <div><h2 id="directory-title">{label("Empresas y sus agentes","Companies and their agents")}</h2>
            <p>{label("Cada ficha reúne los recepcionistas y chatbots vinculados al mismo registro del CRM.","Each profile gathers the receptionists and chatbots linked to the same CRM record.")}</p></div>
          <span className={s.muted}>{projects.error?"—":number(unlinked)} {label("sin asignar en esta página","unassigned on this page")}</span>
        </div>
        {!projects.error && <CommunicationsPortfolio groups={groups} lang={lang} page={page} loaded={projects.data?.length ?? 0} total={total} />}
      </section>

      <section className={s.section} id="new-agent" aria-labelledby="new-agent-title">
        <div className={s.sectionHead}><div><h2 id="new-agent-title">{label("Agregar agente creado externamente","Add externally built agent")}</h2>
          <p>{label("Un mismo cliente puede tener varios recepcionistas y chatbots. Se guardarán por separado.","One client can have multiple receptionists and chatbots. Each is saved separately.")}</p></div></div>
        <form action={createProject} className={s.form}>
          <div className={s.formGrid}>
            <label>{label("Tipo de agente","Agent type")}
              <select name="module" required defaultValue="receptionist">
                <option value="receptionist">AI Receptionist</option>
                <option value="chatbots">AI Chatbot</option>
              </select>
            </label>
            <label>{label("Nombre interno del agente","Agent's internal name")}
              <input name="name" required maxLength={120} placeholder={label("Ej. Recepción HVAC Miami","e.g. Miami HVAC Reception")} />
            </label>
            <label>{label("Empresa existente en CRM (opcional)","Existing CRM company (optional)")}
              <select name="client_lead_id" defaultValue="">
                <option value="">{label("Sin asignar / usar empresa nueva","Unassigned / enter a new company")}</option>
                {(crmChoices.data ?? []).map(company =>
                  <option key={company.id} value={company.id}>{company.company}{company.contact?` · ${company.contact}`:""} · {company.id.slice(0,8)}</option>)}
              </select>
            </label>
            <label>{label("Cliente confirmado de Client 360° (opcional)","Confirmed Client 360 company (optional)")}
              <select name="client_id" defaultValue="">
                <option value="">{label("Sin seleccionar","Not selected")}</option>
                {(crmClients.data ?? []).map(client=><option key={client.id} value={client.id}>
                  {client.trade_name||client.legal_name} · {client.client_code}
                </option>)}
              </select>
            </label>
            <label>{label("O registrar una empresa nueva (opcional)","Or register a new company (optional)")}
              <input name="company_name" maxLength={200} autoComplete="organization" placeholder={label("Nombre legal / comercial","Legal / trade name")} />
            </label>
          </div>
          <label>{label("Herramienta de origen","Source tool")}
            <select name="source_tool" defaultValue="manual">
              <option value="manual">{label("Registro manual","Manual registration")}</option>
              <option value="claude_code">Claude Code</option>
              <option value="codex">Codex</option>
              <option value="higgsfield">Higgsfield</option>
              <option value="other">{label("Otra","Other")}</option>
            </select>
          </label>
          <div className={s.formGrid}>
            <label>{label("URL HTTPS externa","External HTTPS URL")}<input name="url" type="url" maxLength={500}/></label>
            <label>{label("Repositorio autorizado","Authorized repository")}<input name="repository" type="url" maxLength={500}/></label>
            <label>{label("Plataforma / proveedor","Platform / provider")}<input name="deployment" maxLength={500}/></label>
          </div>
          <label>{label("Descripción o función del agente","Agent description or purpose")}
            <textarea name="description" rows={3} maxLength={2000} placeholder={label("Qué hará este agente para la empresa","What this agent is intended to handle for the company")} />
          </label>
          <p className={s.muted}>{label(
            "Elige un cliente confirmado o un lead del CRM. Si eliges ambos, sus identificadores deben corresponder al mismo negocio; si seleccionas un cliente confirmado no se crea un lead duplicado. No se registra una venta.",
            "Select a confirmed client or CRM lead. If both are selected, their IDs must belong to the same business; selecting a confirmed client does not create a duplicate lead. No sale is recorded.")}</p>
          {crmChoices.error && <DbNotice lang={lang} error={crmChoices.error} />}
          {crmClients.error && <DbNotice lang={lang} error={crmClients.error} />}
          <div><button type="submit" disabled={Boolean(crmChoices.error || crmClients.error || projects.error)}>{label("Registrar agente","Register agent")}</button></div>
        </form>
      </section>

      <section className={s.section} aria-labelledby="external-deliveries-title">
        <div className={s.sectionHead}><div><h2 id="external-deliveries-title">{label("Recepción de agentes externos","External agent deliveries")}</h2></div></div>
        <ModuleDeliveryPanel lang={lang} module="receptionist"/>
        <ModuleDeliveryPanel lang={lang} module="chatbots"/>
      </section>

      <section className={s.section} aria-labelledby="tools-title">
        <div className={s.sectionHead}><div><h2 id="tools-title">{label("Operaciones compartidas","Shared operations")}</h2></div></div>
        <nav className={s.productLinks} aria-label={label("Operaciones de comunicación","Communications operations")}>
          <Link href="/admin/workspace/ai-communications/knowledge">Knowledge Base</Link>
          <Link href="/admin/workspace/ai-communications/conversations">Conversations</Link>
          <Link href="/admin/workspace/ai-communications/appointments">Appointments</Link>
          <Link href="/admin/workspace/ai-communications/analytics">Analytics</Link>
        </nav>
      </section>
      <p className={s.footer}>{label(
        "Estados y cifras provienen de Supabase. «Activo» es el estado del proyecto interno, no una llamada o chat conectado. Los proveedores de IA y telefonía, conversaciones reales y publicación del widget siguen pendientes de configuración autorizada.",
        "Statuses and figures come from Supabase. “Active” is an internal project state, not an active call or chat connection. AI and telephony providers, real conversations and widget publishing require separate authorization and configuration.")}</p>
    </div>
  </Suite>;
}
