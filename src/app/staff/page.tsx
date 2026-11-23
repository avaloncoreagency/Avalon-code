import Link from "next/link";
import { requireStaff } from "@/lib/auth/staff";
import { signOut } from "@/app/dashboard/actions";
import { createStaffCasefile, editStaffCasefile, sendStaffMessage, readStaffMessage } from "./actions";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Grant = { user_id: string; client_id: string; client_name: string; access_level: string };
type Casefile = { id: string; title: string; contact_name: string; notes: string; status: string; linked_client_id: string | null; updated_at: string };
type Contact = { user_id: string; display_name: string };
type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null };
const statuses: Record<string, string> = {
 "case-created": "Expediente privado creado.", "case-saved": "Expediente actualizado.",
 sent: "Mensaje enviado.", read: "Mensaje marcado como leído.",
 denied: "No tienes permiso para esa acción.", invalid: "Revisa los campos del formulario.",
 failed: "No se pudo confirmar el cambio. No intentes duplicarlo sin revisar.",
};

export default async function StaffPortal({ searchParams }: {
  searchParams: Promise<{ status?: string }>;
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
  const { status } = await searchParams;
  const grants = (assigned.data ?? []) as Grant[];
  const casefiles = (files.data ?? []) as Casefile[];
  const contacts = (people.data ?? []) as Contact[];
  const messages = (mail.data ?? []) as Message[];
  const byId = new Map(contacts.map(p => [p.user_id, p.display_name]));
  const available = !(assigned.error || files.error || people.error || mail.error);
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
    {!available && <p role="alert" className={s.flash}>El portal no está disponible en este entorno. No se mostrará información parcial.</p>}
    {available && <>
      {!myLeads.error && <section className={s.panel} aria-labelledby="staff-leads">
        <h2 id="staff-leads">Mis leads</h2>
        <p className={s.muted}>Solo los leads que la dirección te asignó. Sin valores, pipeline completo ni finanzas.</p>
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
    </>}
    <footer><Link href="/admin/login">Acceso Avalon</Link></footer>
  </main>;
}
