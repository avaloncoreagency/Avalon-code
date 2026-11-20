import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { requireOwner } from "@/lib/auth/session";
import { setStaffAccess, grantStaffClient, revokeStaffClient } from "./actions";
import { sendStaffMessage, readStaffMessage } from "@/app/staff/actions";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";
type StaffMember = { user_id:string; role:string; email:string; display_name:string };
type Access = { user_id:string; active:boolean; can_create_casefiles:boolean; can_message:boolean };
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
 sent:"Mensaje privado enviado.",read:"Mensaje marcado como leído.",
};

export default async function StaffAdministration({searchParams}:{
 searchParams:Promise<{status?:string}>;
}) {
 const {supabase,userId} = await requireOwner();
 const [roster,access,grants,clients,casefiles,contacts,messages,audit] = await Promise.all([
   supabase.rpc("office_directory"),
   supabase.from("staff_portal_access").select("user_id,active,can_create_casefiles,can_message"),
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
 ]);
 const {status} = await searchParams;
 const ready = ![roster,access,grants,clients,casefiles,contacts,messages,audit].some(x=>x.error);
 const members = ((roster.data ?? []) as StaffMember[]).filter(m=>m.role==="operator");
 const a = (access.data ?? []) as Access[], g = (grants.data ?? []) as Grant[];
 const options=(clients.data ?? []) as Client[], f=(casefiles.data ?? []) as Casefile[];
 const contactsList=(contacts.data ?? []) as Contact[], mail=(messages.data ?? []) as Message[];
 const events=(audit.data ?? []) as AuditEvent[];
 const display = new Map(((roster.data ?? []) as StaffMember[]).map(m=>[m.user_id,m.display_name||m.email]));
 const names = new Map(contactsList.map(m=>[m.user_id,m.display_name]));
 return <Suite active="staff"><div className={s.hud}>
   <header className={s.header}><div><p className={s.eyebrow}>AVALON / DIRECCIÓN</p>
     <h1>Empleados y permisos</h1>
     <p>Solo Miguel y Samuel como propietarios pueden activar cuentas y asignar clientes.
       Los expedientes privados son visibles aquí; los mensajes privados siguen siendo solo de sus participantes.</p>
   </div><Link className={s.button} href="/admin/workspace/crm/clients">Volver a Clientes 360°</Link></header>
   {status && Object.hasOwn(statuses,status) && <p role="status" className={s.flash}>{statuses[status]}</p>}
   {!ready && <p role="alert" className={s.flash}>El módulo aún no está disponible. Verifica la migración, permisos y conexión del entorno aislado.</p>}
   {ready && <>
    <section className={s.panel} aria-labelledby="staff-roster"><h2 id="staff-roster">Control de empleados</h2>
      <p className={s.muted}>Fase 1: solo empleados que ya existan en Auth y tengan membresía técnica <code>operator</code>. Activar un permiso no crea cuentas ni envía invitaciones.</p>
      {!members.length && <p>No hay empleados preaprobados. No se autoriza el registro público.</p>}
      <div className={s.grid}>{members.map(m=>{
        const current=a.find(x=>x.user_id===m.user_id);
        return <article className={s.card} key={m.user_id}>
          <h3>{m.display_name||m.email}</h3><p className={s.muted}>{m.email}</p>
          <p><strong>{current?.active ? "Activo" : "Sin acceso"}</strong></p>
          <form action={setStaffAccess} className={s.form}>
            <input name="employee_id" type="hidden" value={m.user_id}/>
            <label className={s.field}>Nombre visible a compañeros
              <input name="display_name" defaultValue={m.display_name||m.email.split("@")[0]} maxLength={80} required />
            </label>
            <label className={s.field}>Acceso al portal <select name="active" defaultValue={current?.active?"yes":"no"}>
              <option value="no">Revocado / inactivo</option><option value="yes">Activo</option>
            </select></label>
            <label><input type="checkbox" name="can_create_casefiles" value="yes" defaultChecked={current?.can_create_casefiles} /> Crear expedientes privados</label>
            <label><input type="checkbox" name="can_message" value="yes" defaultChecked={current?.can_message} /> Mensajería privada</label>
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
          {members.filter(m=>a.some(x=>x.user_id===m.user_id&&x.active)).map(m=><option value={m.user_id} key={m.user_id}>{m.display_name||m.email}</option>)}
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
