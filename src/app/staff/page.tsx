import Link from "next/link";
import { requireStaff } from "@/lib/auth/staff";
import { signOut } from "@/app/dashboard/actions";
import { randomUUID } from "node:crypto";
import { createStaffCasefile, editStaffCasefile, sendStaffMessage, readStaffMessage, createMyWorkItem, updateMyWorkItem, addStaffNote } from "./actions";
import { WorkCalendar } from "@/components/staff/work-calendar";
import { StaffCommercialHistory } from "@/components/staff/commercial-history";
import { SellerPipeline } from "@/components/staff/seller-pipeline";
import { SELLER_MESSAGES, isSellerTitle } from "@/lib/staff/seller";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { DEFAULT_TZ, KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL, dayKey, timeLabel, when, workKpis, type WorkItem } from "@/lib/staff/work";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Grant = { user_id: string; client_id: string; client_name: string; access_level: string };
type Casefile = { id: string; title: string; contact_name: string; notes: string; status: string; linked_client_id: string | null; updated_at: string };
type Contact = { user_id: string; display_name: string };
type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null };
const statuses: Record<string, string> = {
 "case-created": "Expediente privado creado.", "case-saved": "Expediente actualizado.",
 sent: "Mensaje enviado.", read: "Mensaje marcado como leído.",
 "work-saved": "Actividad guardada.", "note-saved": "Nota guardada.", stale: "Otra persona cambió esta actividad; revisa la versión actual.",
 "evidence-required": "Para completar una actividad añade una nota de cómo se completó.",
 denied: "No tienes permiso para esa acción.", invalid: "Revisa los campos del formulario.",
 failed: "No se pudo confirmar el cambio. No intentes duplicarlo sin revisar.",
};

export default async function StaffPortal({ searchParams }: {
  searchParams: Promise<{ status?: string; error?: string; view?: string; d?: string; commercial?: string }>;
}) {
  const { supabase, userId, user, permissions } = await requireStaff();
  const [assigned, files, people, mail, myLeads] = await Promise.all([
    supabase.from("staff_client_grants").select("user_id,client_id,client_name,access_level")
      .eq("user_id", userId).eq("active", true).order("client_name").limit(150),
    supabase.from("staff_casefiles").select("id,title,contact_name,notes,status,linked_client_id,updated_at")
      .eq("user_id",userId).order("updated_at", {ascending:false}).limit(100),
    supabase.from("staff_contacts").select("user_id,display_name").eq("is_listed",true)
      .order("display_name").limit(100),
    supabase.from("staff_private_messages").select("id,sender_id,recipient_id,body,created_at,read_at")
      .order("created_at",{ascending:false}).limit(100),
    supabase.rpc("staff_my_leads"),
  ]);
  const [{ status, error: errorCode, view: viewParam, d, commercial }, lang] = await Promise.all([searchParams, getLang()]);
  const seller = isSellerTitle(permissions.job_title);
  // Sellers always keep their own calendar; other employees need the owners' explicit permission.
  const canCreateOwn = permissions.can_create_events || seller;
  // Work calendar, tasks and notes (migration 20261124100000). RLS returns only what this employee may read.
  const [itemsR, notesR] = await Promise.all([
    supabase.from("staff_work_items").select("id,kind,origin,assignee_id,created_by,title,instructions,starts_at,ends_at,due_at,time_zone,priority,status,lead_id,client_id,assignee_can_reschedule,completion_note,completed_at,version,updated_at")
      .order("updated_at", { ascending: false }).limit(500),
    supabase.from("staff_notes").select("id,author_id,visibility,item_id,lead_id,body,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const workReady = !itemsR.error && !notesR.error;
  const items = (itemsR.data ?? []) as WorkItem[];
  const notes = (notesR.data ?? []) as { id: string; author_id: string; visibility: string; item_id: string | null; lead_id: string | null; body: string; created_at: string }[];
  const nowIso = new Date().toISOString(), today = dayKey(nowIso, DEFAULT_TZ);
  const view = (["month", "week", "day"] as const).find(v => v === viewParam) ?? "week";
  const anchor = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
  const mine = items.filter(i => i.assignee_id === userId);
  const openWork = mine.filter(i => i.status !== "done" && i.status !== "cancelled").sort((a, b) => Date.parse(when(a) ?? a.updated_at) - Date.parse(when(b) ?? b.updated_at));
  const grants = (assigned.data ?? []) as Grant[];
  const casefiles = (files.data ?? []) as Casefile[];
  const contacts = (people.data ?? []) as Contact[];
  const messages = (mail.data ?? []) as Message[];
  const byId = new Map(contacts.map(p => [p.user_id, p.display_name]));
  const available = !(assigned.error || files.error || people.error || mail.error);
  const kpi = workKpis(mine, nowIso, { leads: myLeads.error ? 0 : (myLeads.data ?? []).length, clients: (assigned.data ?? []).length,
    casefilesOpen: ((files.data ?? []) as { status: string }[]).filter(f => f.status !== "closed").length });
  // Seller leads (migration 20261123190000). Optional: absent → section hidden, never partial CRM data.
  const leads = (myLeads.error ? [] : myLeads.data ?? []) as { lead_id: string; company: string; contact: string; email: string | null; phone: string | null; stage: string; access_level: string; next_activity_at: string | null }[];
  return <main className={s.hud} style={{maxWidth:1220,margin:"0 auto",padding:"20px 16px"}}>
    <header className={s.header}>
      <div><p className={s.eyebrow}>AVALON / PORTAL DE EMPLEADOS</p>
        <h1>Mi espacio de trabajo</h1>
        <p>Sesión de {user.email ?? "empleado"} · Solo tus clientes asignados y tus expedientes privados.</p>
      </div>
      <form action={signOut}><button className={s.button} type="submit">Cerrar sesión</button></form>
    </header>
    {status && Object.hasOwn(statuses,status) && <p role="status" className={s.flash}>{statuses[status]}</p>}
    {status && !Object.hasOwn(statuses,status) && Object.hasOwn(SELLER_MESSAGES,status) && <p role="status" className={s.flash}>{SELLER_MESSAGES[status]}</p>}
    {errorCode && Object.hasOwn(SELLER_MESSAGES,errorCode) && <p role="alert" className={s.flash} data-tone="error">{SELLER_MESSAGES[errorCode]}</p>}
    {!available && <p role="alert" className={s.flash}>El portal no está disponible en este entorno. No se mostrará información parcial.</p>}
    {available && <>
      <nav className={s.inline} aria-label="Secciones del portal" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {[["dashboard", "Mi dashboard"], ...(seller ? [["seller-leads", "Mis leads"], ["seller-quotes", "Mis propuestas"], ["seller-sales", "Mis ventas"]] : []),
          ["calendar", "Mi calendario"], ["tasks", "Mis tareas"], ["staff-leads", seller ? "Leads con acceso" : "Mis leads"], ["staff-assigned", "Mis clientes"],
          ["staff-files", "Mis expedientes"], ["notes", "Mis notas"], ["staff-messages", "Mensajes"], ["staff-commercial", pick(lang, "Mis ventas y comisiones", "My sales and commissions")], ["profile", "Perfil y seguridad"]].map(([id, label]) =>
          <a key={id} className={s.button} href={`#${id}`}>{label}</a>)}
      </nav>
      {!workReady && <p role="alert" className={s.flash}>El calendario de trabajo aún no está disponible en este entorno (falta la migración). El resto del portal funciona.</p>}
      {workReady && <section className={s.panel} aria-labelledby="dashboard">
        <h2 id="dashboard">Mi dashboard</h2>
        <p className={s.muted}>Métricas de tus registros reales. No incluye ingresos, costos ni datos de otras personas.</p>
        <div className={s.stats} data-kpis>
          {([["Leads asignados", kpi.leads], ["Clientes asignados", kpi.clients], ["Actividades abiertas", kpi.open], ["Vencidas", kpi.overdue],
            ["Próximos 7 días", kpi.upcoming7], ["Completadas (30 días)", kpi.done30], ["Citas programadas", kpi.appointmentsScheduled],
            ["Citas completadas", kpi.appointmentsDone], ["Seguimientos hechos", kpi.followUpsDone], ["Seguimientos pendientes", kpi.followUpsPending],
            ["Leads trabajados", kpi.leadsWorked], ["Expedientes activos", kpi.casefilesOpen]] as const).map(([label, value]) =>
            <div key={label} className={s.stat} data-kpi={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>}
      {seller && <SellerPipeline supabase={supabase} />}
      <StaffCommercialHistory supabase={supabase} lang={lang} view={view} day={anchor} pageParam={commercial} />
      {workReady && <section className={s.panel} aria-labelledby="calendar">
        <h2 id="calendar">Mi calendario</h2>
        <p className={s.muted}>Solo tus actividades asignadas, las tuyas propias y las compartidas contigo. Los calendarios privados de la dirección no son visibles aquí.</p>
        <WorkCalendar items={items} view={view} anchor={anchor} tz={DEFAULT_TZ} basePath="/staff" today={today} />
        {canCreateOwn ? <details>
          <summary>Nueva actividad propia</summary>
          <form action={createMyWorkItem} className={s.form} aria-label="Nueva actividad propia">
            <input type="hidden" name="idempotency_key" value={randomUUID()} /><input type="hidden" name="time_zone" value={DEFAULT_TZ} />
            <div className={s.row}>
              <label className={s.field}>Tipo<select name="kind" defaultValue="follow_up">{(["follow_up", "appointment", "task"] as const).map(k => <option key={k} value={k}>{KIND_LABEL[k][0]}</option>)}</select></label>
              <label className={s.field}>Título<input name="title" required maxLength={200} /></label>
            </div>
            <div className={s.row}>
              <label className={s.field}>Fecha<input type="date" name="date" required defaultValue={today} /></label>
              <label className={s.field}>Hora (o vencimiento)<input type="time" name="start" defaultValue="09:00" /></label>
              <label className={s.field}>Fin (opcional)<input type="time" name="end" /></label>
            </div>
            <label className={s.field}>Lead asignado (opcional)<select name="lead_id" defaultValue=""><option value="">—</option>
              {(myLeads.error ? [] : (myLeads.data ?? []) as { lead_id: string; company: string }[]).map(l => <option key={l.lead_id} value={l.lead_id}>{l.company}</option>)}</select></label>
            <label className={s.field}>Notas para ti<textarea name="instructions" maxLength={4000} rows={2} /></label>
            <button className={s.button} type="submit">Guardar actividad</button>
          </form>
        </details> : <p className={s.muted}>La dirección no te ha habilitado crear actividades propias; puedes trabajar las asignadas.</p>}
      </section>}
      {workReady && <section className={s.panel} aria-labelledby="tasks">
        <h2 id="tasks">Mis tareas y actividades</h2>
        {openWork.length === 0 ? <p>No tienes actividades abiertas.</p> :
          <ul className={s.list} aria-label="Actividades abiertas">{openWork.map(i => { const w = when(i); return <li key={i.id} data-task={i.id} data-status={i.status}>
            <strong>{i.title}</strong> <span className={s.muted}>{KIND_LABEL[i.kind][0]} · {PRIORITY_LABEL[i.priority][0]} · {STATUS_LABEL[i.status][0]} · {i.origin === "staff_assigned" ? "Asignada por la dirección" : "Propia"}
              {w ? ` · ${dayKey(w, i.time_zone)} ${timeLabel(w, i.time_zone, "es")}` : ""}</span>
            {i.instructions && <p className={s.muted}>{i.instructions}</p>}
            <form action={updateMyWorkItem} className={s.inline} aria-label={`Actualizar ${i.title}`}>
              <input type="hidden" name="item_id" value={i.id} /><input type="hidden" name="version" value={i.version} />
              <label className={s.srOnly} htmlFor={`st-${i.id}`}>Estado</label>
              <select id={`st-${i.id}`} name="status" defaultValue={i.status === "todo" ? "in_progress" : "done"}>
                <option value="in_progress">En curso</option><option value="done">Completar</option>
                {i.origin === "staff_created" && <option value="cancelled">Cancelar</option>}</select>
              <label className={s.srOnly} htmlFor={`ev-${i.id}`}>Evidencia</label>
              <input id={`ev-${i.id}`} name="completion_note" maxLength={2000} placeholder="Cómo se completó (obligatorio al completar)" />
              <button className={s.button} type="submit">Guardar</button>
            </form>
          </li>; })}</ul>}
      </section>}
      {workReady && <section className={s.panel} aria-labelledby="notes">
        <h2 id="notes">Mis notas internas</h2>
        <p className={s.muted}>Personal: solo tú la ves. De trabajo: la ven la dirección y quien tenga acceso a la actividad vinculada. Las notas no se editan ni se borran (historial).</p>
        <form action={addStaffNote} className={s.form} aria-label="Nueva nota">
          <div className={s.row}>
            <label className={s.field}>Tipo<select name="visibility" defaultValue="personal"><option value="personal">Personal</option><option value="work">De trabajo</option></select></label>
            <label className={s.field}>Actividad (solo notas de trabajo)<select name="item_id" defaultValue=""><option value="">—</option>
              {mine.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
          </div>
          <label className={s.field}>Nota<textarea name="body" required maxLength={4000} rows={2} /></label>
          <button className={s.button} type="submit">Guardar nota</button>
        </form>
        {notes.length === 0 ? <p>Aún no hay notas.</p> : <ul className={s.list} aria-label="Notas">{notes.map(n => <li key={n.id} data-note={n.visibility}>
          <span className={s.tag}>{n.visibility === "personal" ? "Personal" : "Trabajo"}</span> {n.body}
          <br /><span className={s.muted}>{new Date(n.created_at).toLocaleString("es", { timeZone: DEFAULT_TZ })}{n.author_id !== userId ? " · de otra persona autorizada" : ""}</span></li>)}</ul>}
      </section>}
      {!myLeads.error && <section className={s.panel} aria-labelledby="staff-leads">
        <h2 id="staff-leads">{seller ? "Leads con acceso" : "Mis leads"}</h2>
        <p className={s.muted}>{seller ? "Todos los leads a los que tienes acceso: los tuyos y los que la dirección compartió contigo para consulta. Solo los tuyos admiten propuestas y cierres."
          : "Solo los leads que la dirección te asignó. Sin valores, pipeline completo ni finanzas."}</p>
        {leads.length === 0 ? <p>Por ahora no tienes leads asignados.</p> :
          <ul className={s.list}>{leads.map(l => <li key={l.lead_id} data-lead>
            <strong>{l.company}</strong>{l.contact ? ` · ${l.contact}` : ""} · {l.stage}
            {l.access_level === "work" && (l.email || l.phone) ? <><br /><span className={s.muted}>{[l.email, l.phone].filter(Boolean).join(" · ")}</span></> : null}
            <br /><span className={s.muted}>{l.next_activity_at ? `Próximo seguimiento: ${new Date(l.next_activity_at).toLocaleDateString("es")}` : "Sin seguimiento programado"}</span>
          </li>)}</ul>}
      </section>}
      <section className={s.panel} aria-labelledby="staff-assigned">
        <h2 id="staff-assigned">Clientes asignados</h2>
        <p className={s.muted}>Solo se muestra el nombre autorizado. El CRM completo, las ventas y las finanzas siguen reservados a la dirección.</p>
        {grants.length === 0 && <p>Por ahora no tienes clientes asignados.</p>}
        <ul className={s.list}>{grants.map(g => <li key={g.client_id}>
          <strong>{g.client_name}</strong> · {g.access_level === "work" ? "Trabajo sobre expediente privado" : "Consulta de ficha resumida"}
        </li>)}</ul>
      </section>
      <section className={s.panel} aria-labelledby="staff-files">
        <h2 id="staff-files">Mis expedientes privados</h2>
        <p className={s.muted}>Estos expedientes solo son visibles para ti y los dos propietarios. Otros empleados no podrán verlos, aunque trabajen con el mismo cliente.</p>
        {permissions.can_create_casefiles && <details>
          <summary>+ Crear expediente privado</summary>
          <form action={createStaffCasefile} className={s.form}>
            <label className={s.field}>Empresa o título <input name="title" required maxLength={200} /></label>
            <label className={s.field}>Persona de contacto <input name="contact_name" maxLength={160} /></label>
            <label className={s.field}>Vincular a un cliente asignado (opcional)
              <select name="linked_client_id" defaultValue=""><option value="">Privado, sin vínculo</option>
                {grants.filter(g => g.access_level === "work").map(g =>
                  <option key={g.client_id} value={g.client_id}>{g.client_name}</option>)}
              </select>
            </label>
            <label className={s.field}>Información y notas <textarea name="notes" rows={4} maxLength={12000} /></label>
            <button className={s.button} type="submit">Guardar expediente privado</button>
          </form>
        </details>}
        {!permissions.can_create_casefiles && <p>La creación de expedientes no está habilitada para tu cuenta.</p>}
        {casefiles.length === 0 && <p>No has creado expedientes.</p>}
        <div className={s.grid}>{casefiles.map(c => <article key={c.id} className={s.card}>
          <h3>{c.title}</h3><p className={s.muted}>{c.contact_name || "Sin contacto"} · {c.status}</p>
          <p className={s.muted}>Actualizado: {new Date(c.updated_at).toLocaleDateString("es")}</p>
          <p>{c.notes || "Sin notas"}</p>
          <details><summary>Editar expediente</summary>
            <form action={editStaffCasefile} className={s.form}>
              <input type="hidden" name="case_id" value={c.id}/>
              <label className={s.field}>Título <input name="title" defaultValue={c.title} maxLength={200} required /></label>
              <label className={s.field}>Contacto <input name="contact_name" defaultValue={c.contact_name} maxLength={160} /></label>
              <label className={s.field}>Notas <textarea name="notes" defaultValue={c.notes} maxLength={12000} rows={5}/></label>
              <label className={s.field}>Estado <select name="case_status" defaultValue={c.status}>
                <option value="open">Abierto</option><option value="in_progress">En progreso</option><option value="closed">Cerrado</option>
              </select></label>
              <button className={s.button} type="submit">Actualizar expediente</button>
            </form>
          </details>
        </article>)}</div>
      </section>
      <section className={s.panel} aria-labelledby="staff-messages">
        <h2 id="staff-messages">Mensajería privada</h2>
        <p className={s.muted}>Cada conversación es accesible solamente para el remitente y el destinatario. Ni otros compañeros ni los administradores ajenos al chat pueden leerla.</p>
        {permissions.can_message ? <form action={sendStaffMessage} className={s.form}>
          <label className={s.field}>Para <select name="recipient_id" required defaultValue="">
            <option value="" disabled>Seleccionar compañero o administrador</option>
            {contacts.filter(c => c.user_id !== userId).map(c =>
              <option key={c.user_id} value={c.user_id}>{c.display_name}</option>)}
          </select></label>
          <label className={s.field}>Mensaje <textarea name="body" required rows={3} maxLength={4000}/></label>
          <button className={s.button} type="submit">Enviar mensaje privado</button>
        </form> : <p>La mensajería está deshabilitada para tu cuenta.</p>}
        <h3>Mis mensajes recientes</h3>
        {messages.length === 0 && <p>No tienes mensajes.</p>}
        <ul className={s.list}>{messages.map(m => <li key={m.id} className={s.notice}>
          <strong>{m.sender_id === userId ? "Para" : "De"}: {byId.get(m.sender_id === userId ? m.recipient_id : m.sender_id) ?? "Miembro autorizado"}</strong>
          <p style={{whiteSpace:"pre-wrap"}}>{m.body}</p>
          <small>{new Date(m.created_at).toLocaleString("es")}</small>
          {m.recipient_id === userId && !m.read_at && <form action={readStaffMessage}>
            <input type="hidden" name="message_id" value={m.id}/>
            <button className={s.button} type="submit">Marcar como leído</button>
          </form>}
        </li>)}</ul>
      </section>
      <section className={s.panel} aria-labelledby="profile">
        <h2 id="profile">Perfil y seguridad</h2>
        <dl className={s.detail}>
          <div><dt>Cuenta</dt><dd>{user.email ?? "—"}</dd></div>
          <div><dt>Permisos</dt><dd>{[seller && "ventas propias (leads, propuestas y cierres)", canCreateOwn && "crear actividades propias", permissions.can_create_casefiles && "expedientes", permissions.can_message && "mensajería"].filter(Boolean).join(" · ") || "solo trabajo asignado"}</dd></div>
          <div><dt>Verificación en dos pasos</dt><dd><Link href="/staff/mfa">Configurar o revisar MFA</Link></dd></div>
        </dl>
        <p className={s.muted}>Tus permisos los gestiona la dirección. Este portal no da acceso al CRM completo, las finanzas ni la administración.</p>
      </section>
    </>}
    <footer><Link href="/admin/login">Acceso Avalon</Link></footer>
  </main>;
}
