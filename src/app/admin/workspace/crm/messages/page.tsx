import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { personDisplayName } from "@/lib/identity/owners";
import { sendInternalMessage, markInternalMessageRead } from "./actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
type Contact = { user_id: string; display_name: string };
type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null };
const feedback: Record<string, [string, string]> = {
  sent: ["Mensaje enviado.", "Message sent."],
  read: ["Mensaje marcado como leído.", "Message marked as read."],
  failed: ["No se pudo confirmar la operación. Revisa el estado antes de reintentar.", "The operation could not be confirmed. Check its status before retrying."],
  invalid: ["Revisa los datos ingresados.", "Check the submitted fields."],
};

/** A private owner inbox: all data is filtered by participant and protected by Staff RLS. */
export default async function OwnerMessagesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const params = await searchParams;
  const rawPage = q(params, "page") ?? "";
  const page = /^\d{1,5}$/.test(rawPage) ? Math.min(Number(rawPage), 10000) : 0;

  const [contactsR, messagesR] = await Promise.all([
    supabase.from("staff_contacts").select("user_id,display_name").eq("is_listed", true).order("display_name").limit(500),
    supabase.from("staff_private_messages")
      .select("id,sender_id,recipient_id,body,created_at,read_at", { count: "exact" })
      .or("sender_id.eq." + userId + ",recipient_id.eq." + userId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
  ]);
  const ready = !contactsR.error && !messagesR.error;
  const contacts = (contactsR.data ?? []) as Contact[];
  const messages = (messagesR.data ?? []) as Message[];
  const names = new Map(contacts.map(c => [c.user_id, personDisplayName(c, pick(lang, "Miembro autorizado", "Authorized member"))]));
  const recipients = contacts.filter(c => c.user_id !== userId);
  const total = messagesR.count;
  const unread = messages.filter(m => m.recipient_id === userId && !m.read_at).length;
  const status = q(params, "status");
  const notice = status && Object.hasOwn(feedback, status) ? feedback[status] : null;

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="messages" eyebrow="CRM / Internal Messaging"
      title={pick(lang, "Mensajes internos", "Internal messages")}
      lead={pick(lang,
        "Habla con Samuel y empleados autorizados. Solo los participantes pueden leer cada conversación; los mensajes de clientes siguen en su bandeja comercial.",
        "Message Samuel and authorized staff. Only participants can read each conversation; customer inquiries remain in the commercial inbox.")}
      actions={<Link className={s.button} href="/admin/staff">{pick(lang, "Portal de Agentes", "Agent Portal")}</Link>} />
    {notice && <p role="status" className={s.flash} data-tone={status === "failed" || status === "invalid" ? "error" : "ok"}>{pick(lang, ...notice)}</p>}
    {!ready ? <section className={s.panel} role="alert">
      <h2>{pick(lang, "Mensajería no disponible", "Messaging unavailable")}</h2>
      <p className={s.muted}>{pick(lang,
        "La mensajería interna requiere las migraciones de Staff y permisos correctos. No se mostrarán mensajes parciales ni se habilitarán envíos.",
        "Internal messaging requires Staff migrations and valid permissions. Partial messages and sending are disabled.")}</p>
    </section> : <div className={s.grid}>
      <section className={s.panel} aria-labelledby="compose-private-message">
        <h2 id="compose-private-message">{pick(lang, "Nuevo mensaje", "New message")}</h2>
        <form className={s.form} action={sendInternalMessage}>
          <label className={s.field}>
            {pick(lang, "Destinatario autorizado", "Authorized recipient")}
            <select name="recipient_id" required defaultValue="">
              <option value="" disabled>{pick(lang, "Selecciona una persona", "Select a person")}</option>
              {recipients.map(c => <option key={c.user_id} value={c.user_id}>{names.get(c.user_id)}</option>)}
            </select>
          </label>
          <label className={s.field}>
            {pick(lang, "Mensaje privado", "Private message")}
            <textarea name="body" required maxLength={4000} rows={5} />
          </label>
          <button className={s.button} type="submit" disabled={recipients.length === 0}>
            {pick(lang, "Enviar mensaje privado", "Send private message")}
          </button>
        </form>
        {recipients.length === 0 && <p className={s.muted}>{pick(lang,
          "Todavía no hay destinatarios autorizados.", "No authorized recipients are available yet.")}</p>}
      </section>
      <section className={s.panel} aria-labelledby="owner-message-history">
        <h2 id="owner-message-history">{pick(lang, "Mis conversaciones", "My conversations")}</h2>
        <p className={s.muted}>{pick(lang,
          "Solo tus mensajes enviados y recibidos. Los propietarios no pueden leer mensajes privados ajenos.",
          "Only messages you sent and received. Owners cannot read other people's private messages.")}</p>
        <p className={s.muted}>{total === null ? pick(lang, "Total no disponible", "Total unavailable") :
          total + " " + pick(lang, "mensajes", "messages")}
          {" · "}{unread} {pick(lang, "sin leer en esta página", "unread on this page")}</p>
        {messages.length === 0 ? <p className={s.empty}>{pick(lang, "No hay mensajes en esta página.", "No messages on this page.")}</p> :
          <ul className={s.list}>{messages.map(m => <li key={m.id} className={s.notice} data-read={Boolean(m.read_at)}>
            <strong>{m.sender_id === userId ? pick(lang, "Para", "To") : pick(lang, "De", "From")}: {names.get(m.sender_id === userId ? m.recipient_id : m.sender_id) ?? pick(lang, "Miembro autorizado", "Authorized member")}</strong>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</p>
            <small className={s.muted}>{formatDate(lang, m.created_at, true)}</small>
            {m.recipient_id === userId && !m.read_at && <form action={markInternalMessageRead}>
              <input type="hidden" name="message_id" value={m.id} />
              <button className={s.button} type="submit">{pick(lang, "Marcar leído", "Mark read")}</button>
            </form>}
          </li>)}</ul>}
        {(page > 0 || (total !== null && (page + 1) * PAGE_SIZE < total)) &&
          <nav className={s.actions} aria-label={pick(lang, "Páginas de mensajes", "Message pages")}>
            {page > 0 && <Link className={s.button} href={page === 1 ? "/admin/workspace/crm/messages" : "?page=" + (page - 1)}>{pick(lang, "Anterior", "Previous")}</Link>}
            {total !== null && (page + 1) * PAGE_SIZE < total &&
              <Link className={s.button} href={"?page=" + (page + 1)}>{pick(lang, "Siguiente", "Next")}</Link>}
          </nav>}
      </section>
    </div>}
  </div></Suite>;
}
