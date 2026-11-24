import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { randomUUID } from "node:crypto";
import { inviteStaffEmployee, setStaffAccess, grantStaffClient, revokeStaffClient, grantStaffLead, revokeStaffLead, assignWorkItem, manageWorkItem } from "./actions";
import { WorkCalendar } from "@/components/staff/work-calendar";
import { DEFAULT_TZ, KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL, dayKey, timeLabel, when, workKpis, type WorkItem } from "@/lib/staff/work";
import { JOB_TITLES } from "@/lib/auth/staff-roles";
import { personDisplayName } from "@/lib/identity/owners";
import { sendStaffMessage, readStaffMessage } from "@/app/staff/actions";
import s from "@/components/sales/sales.module.css";
import { AgentInvitationPanel } from "@/components/agents/invitation-panel";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
export const dynamic = "force-dynamic";
type StaffMember = { user_id:string; role:string; email:string; display_name:string };
type Access = { user_id:string; active:boolean; can_create_casefiles:boolean; can_message:boolean; can_create_events:boolean; job_title:string };
type LeadGrant = { user_id:string; lead_id:string; access_level:string; active:boolean };
type LeadOption = { id:string; company:string };
type Grant = { user_id:string; client_id:string; client_name:string; access_level:string; active:boolean };
type Client = { id:string; legal_name:string };
type Contact = { user_id:string; display_name:string };
type Casefile = { id:string; user_id:string; title:string; contact_name:string; notes:string; status:string; updated_at:string };
type Message = { id:string;sender_id:string;recipient_id:string;body:string;created_at:string;read_at:string|null };
type AuditEvent = { id:number;actor_id:string;user_id:string;action:string;client_id:string|null;recorded_at:string };
const statuses: Record<string,string> = {
 invalid:"Los datos no son válidos.",denied:"No tienes autorización para esta operación.",
 failed:"No se pudo confirmar el cambio.", "directory-failed":"Acceso actualizado, pero falló la libreta de contactos.",
 "access-enabled":"Acceso de empleado activado.","access-revoked":"Acceso de empleado revocado.",
 "client-granted":"Cliente asignado.","client-revoked":"Acceso al cliente revocado.",
 "lead-granted":"Lead asignado.","lead-revoked":"Acceso al lead revocado.",
 "work-assigned":"Actividad asignada. Solo esa persona la ve.","work-cancelled":"Actividad cancelada.","work-reassigned":"Actividad reasignada.",
 "work-link-denied":"Ese lead o cliente no está asignado a ese empleado: asígnaselo primero.",stale:"La actividad cambió mientras la editabas; revisa la versión actual.",
 sent:"Mensaje privado enviado.",read:"Mensaje marcado como leído.",
};
const inviteStatuses: Readonly<Record<string, readonly [string, string]>> = {
 "invite-sent": ["Supabase Auth aceptó la invitación. La cuenta requiere aprobación del propietario.", "Supabase Auth accepted the invitation. The account requires owner approval."],
 "invite-audit-pending": ["Supabase Auth aceptó la invitación. Falta confirmar el registro de auditoría.", "Supabase Auth accepted the invitation. The audit entry is unconfirmed."],
 "invite-enrollment-pending": ["Supabase Auth aceptó la invitación. No se confirmó el alta del agente. Revisa el estado de la cuenta antes de reenviar.", "Supabase Auth accepted the invitation. Agent enrollment is unconfirmed. Check the account before resending."],
 "invite-failed": ["No se pudo confirmar la invitación. Revisa el estado de la cuenta y la configuración de Supabase antes de reintentar.", "The invitation could not be confirmed. Check the account and Supabase settings before retrying."],
};

export default async function StaffAdministration({searchParams}:{
 searchParams:Promise<{status?:string;view?:string;d?:string;invite_sender?:string}>;
}) {
 const {supabase,userId} = await requireOwner();
 const [roster,access,grants,clients,casefiles,contacts,messages,audit,leadGrants,leads] = await Promise.all([
   supabase.rpc("office_directory"),
   supabase.from("staff_portal_access").select("user_id,active,can_create_casefiles,can_message,can_create_events,job_title"),
   supabase.from("staff_client_grants").select("user_id,client_id,client_name,access_level,active")
     .order("updated_at",{ascending:false}).limit(200),
   supabase.from("crm_clients").select("id,legal_name").neq("status","archived")
     .order("legal_name").limit(300),
   supabase.from("staff_casefiles").select("id,user_id,title,contact_name,notes,status,updated_at")
     .order("updated_at",{ascending:false}).limit(100),
   supabase.from("staff_contacts").select("user_id,display_name").eq("is_listed",true).order("display_name"),
   supabase.from("staff_private_messages").select("id,sender_id,recipient_id,body,created_at,read_at")
     .order("created_at",{ascending:false}).limit(100),
   supabase.from("staff_permission_events").select("id,actor_id,user_id,action,client_id,recorded_at")
     .order("recorded_at",{ascending:false}).limit(40),
   supabase.from("staff_lead_grants").select("user_id,lead_id,access_level,active").eq("active",true).limit(300),
   supabase.from("crm_leads").select("id,company").eq("archived",false).order("updated_at",{ascending:false}).limit(300),
 ]);
 const {status, view: viewParam, d, invite_sender: inviteSender} = await searchParams;
 const lang = await getLang();
 const inviteStatus = status && Object.hasOwn(inviteStatuses, status)
   ? pick(lang, ...inviteStatuses[status]) : null;
 // Staff work (migration 20261124100000). Owners supervise assignments; employees' personal notes are never listed here.
 const itemsR = await supabase.from("staff_work_items").select("id,kind,origin,assignee_id,created_by,title,instructions,starts_at,ends_at,due_at,time_zone,priority,status,lead_id,client_id,assignee_can_reschedule,completion_note,completed_at,version,updated_at")
   .order("updated_at",{ascending:false}).limit(1000);
 const work = (itemsR.error ? [] : itemsR.data ?? []) as WorkItem[];
 const nowIso = new Date().toISOString(), today = dayKey(nowIso, DEFAULT_TZ);
 const view = (["month","week","day"] as const).find(v=>v===viewParam) ?? "week";
 const anchor = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today;
 const ready = ![roster,access,grants,clients,casefiles,contacts,messages,audit,leadGrants,leads].some(x=>x.error);
 const lg=(leadGrants.data ?? []) as LeadGrant[], leadOptions=(leads.data ?? []) as LeadOption[];
 const leadName=new Map(leadOptions.map(l=>[l.id,l.company]));
 const members = ((roster.data ?? []) as StaffMember[]).filter(m=>m.role==="operator");
 const a = (access.data ?? []) as Access[], g = (grants.data ?? []) as Grant[];
 const options=(clients.data ?? []) as Client[], f=(casefiles.data ?? []) as Casefile[];
 const contactsList=(contacts.data ?? []) as Contact[], mail=(messages.data ?? []) as Message[];
 const events=(audit.data ?? []) as AuditEvent[];
 const memberName = (member: StaffMember) => personDisplayName(member, "Empleado");
 const display = new Map(((roster.data ?? []) as StaffMember[]).map(m=>[m.user_id,memberName(m)]));
 const names = new Map(contactsList.map(m=>[m.user_id,m.display_name]));
 return <Suite active="staff"><div className={s.hud}>
   <header className={s.header}><div><p className={s.eyebrow}>AVALON / PORTAL DE AGENTES</p>
     <h1>AGENT PORTAL</h1>
     <p>Solo Miguel y Samuel como propietarios pueden activar cuentas y asignar clientes.
       Los expedientes privados son visibles aquí; los mensajes privados siguen siendo solo de sus participantes.</p>
   </div><Link className={s.button} href="/admin/workspace/crm/clients">Volver a Clientes 360°</Link></header>
   {inviteStatus && <p role="status" className={s.flash}>{inviteStatus}</p>}
   {status && Object.hasOwn(statuses,status) && <p role="status" className={s.flash}>{statuses[status]}</p>}
   {!ready && <p role="alert" className={s.flash}>El módulo aún no está disponible. Verifica la migración, permisos y conexión del entorno aislado.</p>}
   {ready && <>
    <section className={s.panel} aria-labelledby="staff-invite">
      <h2 id="staff-invite">Invitar agente</h2>
      <p className={s.muted}>Solo los propietarios pueden enviar invitaciones. La invitación sale firmada por ti y el acceso permanece desactivado hasta tu aprobación.</p>
      <form action={inviteStaffEmployee} className={s.form} data-agent-invite-form>
        <label className={s.field}>Correo electrónico del agente
          <input type="email" name="employee_email" autoComplete="email" maxLength={254}
            placeholder="agente@empresa.com" required />
        </label>
        <label className={s.field}>Nombre del agente (opcional)
          <input name="invitee_name" maxLength={80} autoComplete="off" />
        </label>
        <label className={s.field}>Cargo
          <select name="invite_job_title" defaultValue="seller">{JOB_TITLES.map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>
        </label>
        <label className={s.field}>Idioma de la invitación
          <select name="invite_lang" defaultValue="es"><option value="es">Español</option><option value="en">English</option></select>
        </label>
        <button className={s.button} type="submit">Enviar invitación segura</button>
      </form>
      <p className={s.muted}>Requiere la función Supabase `staff-invite` habilitada en este entorno y el origen de invitación configurado. El agente no recibe permisos por ser invitado.</p>
    </section>
    <AgentInvitationPanel supabase={supabase} userId={userId} lang={lang} status={inviteSender ?? null} />
    <section className={s.panel} aria-labelledby="staff-roster"><h2 id="staff-roster">Control de empleados</h2>
      <p className={s.muted}>Fase 1: solo empleados que ya existan en Auth y tengan membresía técnica <code>operator</code>. Activar un permiso no crea cuentas ni envía invitaciones.</p>
      {!members.length && <p>No hay empleados preaprobados. No se autoriza el registro público.</p>}
      <div className={s.grid}>{members.map(m=>{
        const current=a.find(x=>x.user_id===m.user_id);
        return <article className={s.card} key={m.user_id}>
          <h3>{memberName(m)}</h3><p className={s.muted}>{m.email}</p>
          <p><strong>{current?.active ? "Activo" : "Sin acceso"}</strong></p>
          <form action={setStaffAccess} className={s.form}>
            <input name="employee_id" type="hidden" value={m.user_id}/>
            <label className={s.field}>Nombre visible a compañeros
              <input name="display_name" defaultValue={personDisplayName(m, "")} maxLength={80} required />
            </label>
            <label className={s.field}>Acceso al portal <select name="active" defaultValue={current?.active?"yes":"no"}>
              <option value="no">Revocado / inactivo</option><option value="yes">Activo</option>
            </select></label>
            <label className={s.field}>Cargo (no concede permisos por sí solo) <select name="job_title" defaultValue={current?.job_title ?? "operator"}>
              {JOB_TITLES.map(([v,l])=><option key={v} value={v}>{l}</option>)}
            </select></label>
            <label><input type="checkbox" name="can_create_casefiles" value="yes" defaultChecked={current?.can_create_casefiles} /> Crear expedientes privados</label>
            <label><input type="checkbox" name="can_message" value="yes" defaultChecked={current?.can_message} /> Mensajería privada</label>
            <label><input type="checkbox" name="can_create_events" value="yes" defaultChecked={current?.can_create_events} /> Crear actividades propias en su calendario</label>
            <button className={s.button} type="submit">Guardar permisos</button>
          </form>
        </article>;
      })}</div>
    </section>
    <section className={s.panel} aria-labelledby="staff-clients"><h2 id="staff-clients">Asignar clientes</h2>
      <p className={s.muted}>La asignación permite consultar el nombre del cliente y trabajar en un expediente separado; no concede acceso a las finanzas ni a todo Cliente 360°.</p>
      <form action={grantStaffClient} className={s.form}>
        <label className={s.field}>Empleado activo <select name="employee_id" required defaultValue="">
          <option value="" disabled>Seleccionar empleado</option>
          {members.filter(m=>a.some(x=>x.user_id===m.user_id&&x.active)).map(m=><option value={m.user_id} key={m.user_id}>{memberName(m)}</option>)}
        </select></label>
        <label className={s.field}>Cliente <select name="client_id" required defaultValue="">
          <option value="" disabled>Seleccionar cliente</option>
          {options.map(c=><option key={c.id} value={c.id}>{c.legal_name}</option>)}
        </select></label>
        <label className={s.field}>Alcance <select name="access_level" defaultValue="view">
          <option value="view">Ver ficha resumida</option>
          <option value="work">Ver + crear/editar expedientes propios vinculados</option>
        </select></label>
        <button className={s.button} type="submit">Asignar cliente</button>
      </form>
      <h3>Asignaciones vigentes</h3>
      <ul className={s.list}>{g.filter(row=>row.active).map(row=><li key={row.user_id+row.client_id} className={s.notice}>
        <strong>{display.get(row.user_id)??"Empleado"}</strong> · {row.client_name} · {row.access_level}
        <form action={revokeStaffClient} className={s.inline}>
          <input type="hidden" name="employee_id" value={row.user_id}/>
          <input type="hidden" name="client_id" value={row.client_id}/>
          <button className={s.button} type="submit">Revocar acceso</button>
        </form>
      </li>)}</ul>
    </section>
    {!itemsR.error && <section className={s.panel} aria-labelledby="staff-work">
      <h2 id="staff-work">Asignar tarea o cita</h2>
      <p className={s.muted}>El empleado verá solo esta actividad (no tu calendario ni el de Samuel/Miguel). Un lead o cliente solo se puede vincular si ya está asignado a esa persona.</p>
      <form action={assignWorkItem} className={s.form} aria-label="Asignar actividad">
        <input type="hidden" name="idempotency_key" value={randomUUID()} /><input type="hidden" name="time_zone" value={DEFAULT_TZ} />
        <div className={s.row}>
          <label className={s.field}>Empleado<select name="employee_id" required defaultValue=""><option value="" disabled>Seleccionar</option>
            {members.filter(m=>a.some(x=>x.user_id===m.user_id&&x.active)).map(m=><option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}</select></label>
          <label className={s.field}>Tipo<select name="kind" defaultValue="task">{(["task","appointment","follow_up"] as const).map(k=><option key={k} value={k}>{KIND_LABEL[k][0]}</option>)}</select></label>
          <label className={s.field}>Prioridad<select name="priority" defaultValue="normal">{(["low","normal","high","urgent"] as const).map(k=><option key={k} value={k}>{PRIORITY_LABEL[k][0]}</option>)}</select></label>
        </div>
        <label className={s.field}>Título<input name="title" required maxLength={200} /></label>
        <div className={s.row}>
          <label className={s.field}>Fecha<input type="date" name="date" required defaultValue={today} /></label>
          <label className={s.field}>Hora (inicio o vencimiento)<input type="time" name="start" defaultValue="10:00" /></label>
          <label className={s.field}>Fin (citas)<input type="time" name="end" /></label>
        </div>
        <div className={s.row}>
          <label className={s.field}>Lead autorizado (opcional)<select name="lead_id" defaultValue=""><option value="">—</option>
            {lg.map(row=><option key={row.user_id+row.lead_id} value={row.lead_id}>{leadName.get(row.lead_id)??"Lead"} · {display.get(row.user_id)??"Empleado"}</option>)}</select></label>
          <label className={s.field}>Cliente autorizado (opcional)<select name="client_id" defaultValue=""><option value="">—</option>
            {g.filter(x=>x.active).map(row=><option key={row.user_id+row.client_id} value={row.client_id}>{row.client_name} · {display.get(row.user_id)??"Empleado"}</option>)}</select></label>
        </div>
        <label className={s.field}>Instrucciones<textarea name="instructions" maxLength={4000} rows={2} /></label>
        <label><input type="checkbox" name="can_reschedule" value="yes" /> El empleado puede reprogramarla</label>
        <button className={s.button} type="submit">Asignar</button>
      </form>
      <h3>Supervisión por empleado</h3>
      <div className={s.tableWrap}><table className={s.table} aria-label="Supervisión por empleado">
        <thead><tr><th scope="col">Empleado</th><th scope="col" className={s.num}>Abiertas</th><th scope="col" className={s.num}>Vencidas</th><th scope="col" className={s.num}>Próx. 7 días</th><th scope="col" className={s.num}>Hechas 30 d</th><th scope="col" className={s.num}>Leads</th></tr></thead>
        <tbody>{members.filter(m=>a.some(x=>x.user_id===m.user_id)).map(m=>{ const k=workKpis(work.filter(i=>i.assignee_id===m.user_id), nowIso, {leads: lg.filter(x=>x.user_id===m.user_id).length, clients: 0, casefilesOpen: 0});
          return <tr key={m.user_id} data-supervision={m.user_id}><td>{memberName(m)}</td><td className={s.num}>{k.open}</td><td className={s.num}>{k.overdue}</td><td className={s.num}>{k.upcoming7}</td><td className={s.num}>{k.done30}</td><td className={s.num}>{k.leads}</td></tr>; })}</tbody>
      </table></div>
      <h3>Calendario del equipo</h3>
      <WorkCalendar items={work} view={view} anchor={anchor} tz={DEFAULT_TZ} basePath="/admin/staff" today={today} names={display} />
      <h3>Asignaciones abiertas</h3>
      <ul className={s.list}>{work.filter(i=>i.origin==="staff_assigned"&&i.status!=="done"&&i.status!=="cancelled").slice(0,100).map(i=>{ const w=when(i); return <li key={i.id} className={s.notice} data-assignment={i.id}>
        <strong>{i.title}</strong> · {display.get(i.assignee_id)??"Empleado"} · {KIND_LABEL[i.kind][0]} · {STATUS_LABEL[i.status][0]}{w?` · ${dayKey(w,i.time_zone)} ${timeLabel(w,i.time_zone,"es")}`:""}
        <form action={manageWorkItem} className={s.inline}><input type="hidden" name="item_id" value={i.id}/><input type="hidden" name="version" value={i.version}/><input type="hidden" name="op" value="cancel"/>
          <button className={s.button} type="submit">Cancelar</button></form>
        <form action={manageWorkItem} className={s.inline}><input type="hidden" name="item_id" value={i.id}/><input type="hidden" name="version" value={i.version}/><input type="hidden" name="op" value="reassign"/>
          <label className={s.srOnly} htmlFor={`re-${i.id}`}>Reasignar a</label>
          <select id={`re-${i.id}`} name="assignee_id" required defaultValue=""><option value="" disabled>Reasignar a…</option>
            {members.filter(m=>m.user_id!==i.assignee_id&&a.some(x=>x.user_id===m.user_id&&x.active)).map(m=><option key={m.user_id} value={m.user_id}>{memberName(m)}</option>)}</select>
          <button className={s.button} type="submit">Reasignar</button></form>
      </li>; })}</ul>
    </section>}
    <section className={s.panel} aria-labelledby="staff-leads"><h2 id="staff-leads">Asignar leads (vendedores)</h2>
      <p className={s.muted}>El vendedor ve solo sus leads asignados: empresa, contacto, etapa y próximo seguimiento. «Trabajar» añade email y teléfono. Nunca ve valores, el pipeline completo ni finanzas.</p>
      <form action={grantStaffLead} className={s.form}>
        <label className={s.field}>Empleado activo <select name="employee_id" required defaultValue="">
          <option value="" disabled>Seleccionar empleado</option>
          {members.filter(m=>a.some(x=>x.user_id===m.user_id&&x.active)).map(m=><option value={m.user_id} key={m.user_id}>{memberName(m)}</option>)}
        </select></label>
        <label className={s.field}>Lead <select name="lead_id" required defaultValue="">
          <option value="" disabled>Seleccionar lead</option>
          {leadOptions.map(l=><option key={l.id} value={l.id}>{l.company}</option>)}
        </select></label>
        <label className={s.field}>Alcance <select name="access_level" defaultValue="view">
          <option value="view">Ver resumen</option><option value="work">Ver + datos de contacto</option>
        </select></label>
        <button className={s.button} type="submit">Asignar lead</button>
      </form>
      <ul className={s.list}>{lg.map(row=><li key={row.user_id+row.lead_id} className={s.notice}>
        <strong>{display.get(row.user_id)??"Empleado"}</strong> · {leadName.get(row.lead_id)??"Lead"} · {row.access_level}
        <form action={revokeStaffLead} className={s.inline}>
          <input type="hidden" name="employee_id" value={row.user_id}/><input type="hidden" name="lead_id" value={row.lead_id}/>
          <button className={s.button} type="submit">Revocar lead</button>
        </form>
      </li>)}</ul>
    </section>
    <section className={s.panel} aria-labelledby="staff-permission-audit">
      <h2 id="staff-permission-audit">Historial de permisos</h2>
      <p className={s.muted}>Últimos 40 cambios registrados por la base de datos. Solo los propietarios tienen acceso.</p>
      {events.length === 0 && <p>Todavía no hay cambios de permisos registrados.</p>}
      <ol className={s.list}>{events.map(event => <li key={event.id}>
        <strong>{event.action.replaceAll("_"," ")}</strong>
        {" · "}{display.get(event.user_id) ?? "Miembro"}
        {" · por "}{display.get(event.actor_id) ?? "Propietario"}
        {event.client_id && <>{" · Cliente: "}{options.find(c=>c.id===event.client_id)?.legal_name ?? "Identificador archivado"}</>}
        {" · "}<time dateTime={event.recorded_at}>{new Date(event.recorded_at).toLocaleString("es")}</time>
      </li>)}</ol>
    </section>
    <section className={s.panel} aria-labelledby="staff-cases"><h2 id="staff-cases">Expedientes privados del personal</h2>
      <p className={s.muted}>Los propietarios pueden supervisar expedientes; entre empleados, cada expediente sigue siendo privado.</p>
      <div className={s.grid}>{f.map(c=><article key={c.id} className={s.card}>
        <strong>{c.title}</strong><p>{display.get(c.user_id)??"Empleado"} · {c.status}</p>
        <details><summary>Ver expediente</summary><p>{c.contact_name}</p><p style={{whiteSpace:"pre-wrap"}}>{c.notes}</p></details>
      </article>)}</div>
      {!f.length && <p>Sin expedientes.</p>}
    </section>
    <section className={s.panel} aria-labelledby="staff-private-chat"><h2 id="staff-private-chat">Mis mensajes privados</h2>
      <p className={s.muted}>La dirección no puede leer conversaciones ajenas. Este buzón contiene solamente mensajes enviados o recibidos por tu propia cuenta.</p>
      <form action={sendStaffMessage} className={s.form}>
        <label className={s.field}>Destinatario <select name="recipient_id" required defaultValue="">
          <option value="" disabled>Seleccionar destinatario</option>
          {contactsList.filter(c=>c.user_id!==userId).map(c=><option key={c.user_id} value={c.user_id}>{c.display_name}</option>)}
        </select></label>
        <label className={s.field}>Mensaje <textarea name="body" required maxLength={4000} rows={3}/></label>
        <button className={s.button}>Enviar mensaje privado</button>
      </form>
      <ul className={s.list}>{mail.map(m=><li key={m.id} className={s.notice}>
        <strong>{m.sender_id===userId?"Para":"De"}: {names.get(m.sender_id===userId?m.recipient_id:m.sender_id)??"Miembro"}</strong>
        <p style={{whiteSpace:"pre-wrap"}}>{m.body}</p><small>{new Date(m.created_at).toLocaleString("es")}</small>
        {m.recipient_id===userId&&!m.read_at&&<form action={readStaffMessage}>
          <input name="message_id" type="hidden" value={m.id}/><button className={s.button}>Marcar leído</button>
        </form>}
      </li>)}</ul>
    </section>
   </>}
 </div></Suite>;
}
