"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, field, uuidField } from "@/lib/os/actions";
import { BANNER_THEMES, CALENDAR_COLORS, EVENT_KINDS, isCalendarDay, moveDay } from "@/lib/crm/shared-calendar";

const PATH = "/admin/workspace/crm/calendar";
export type CalendarResult = { status: "ok" | "invalid" | "conflict" | "unavailable" | "not_ready"; message: string };
const invalid = (message = "Revisa los campos y los horarios.") : CalendarResult => ({ status: "invalid", message });
const ok = (message: string) : CalendarResult => ({ status: "ok", message });
const dbError = (error: { code?: string } | null): CalendarResult => {
  if (error?.code === "23P01") return { status: "conflict", message: "Ya hay otra cita para uno de los participantes en ese horario." };
  if (error?.code === "23505") return { status: "conflict", message: "Ese día ya tiene un banner. Edita el existente." };
  if (error?.code === "42703" || error?.code === "42P01" || error?.code === "PGRST205")
    return { status: "not_ready", message: "La base de datos del calendario todavía no está actualizada." };
  if (error?.code === "23514" || error?.code === "23503")
    return invalid("El horario, participante o vínculo CRM es inválido.");
  return { status: "unavailable", message: "No se pudo guardar. Inténtalo otra vez; no se ha confirmado ningún cambio." };
};
const clean = (form: FormData, key: string, max: number) => field(form, key).trim().slice(0, max + 1);
const versionOf = (form: FormData): number | null => {
  const raw = field(form, "version");
  const n = Number(raw);
  return /^[1-9][0-9]{0,8}$/.test(raw) && Number.isSafeInteger(n) ? n : null;
};
function asIso(raw: string): Date | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(raw)) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2020 && date.getUTCFullYear() <= 2100 ? date : null;
}

/** Every mutation rechecks an authenticated owner, not just the calendar page. */
export async function saveCalendarEvent(form: FormData): Promise<CalendarResult> {
  const { supabase, userId } = await ownerForAction();
  const owners = await supabase.rpc("crm_owner_directory");
  if (owners.error || !owners.data) return dbError(owners.error);
  const allowed = new Set((owners.data as { user_id: string }[]).map(x => x.user_id));
  const ownerId = field(form, "owner_id") || userId;
  if (!allowed.has(ownerId)) return invalid("El responsable debe ser un propietario autorizado.");
  const rawAttendees = form.getAll("attendee_ids");
  if (rawAttendees.some(x => typeof x !== "string" || !allowed.has(x)) || rawAttendees.length > 10)
    return invalid("Solo puedes invitar a propietarios de Avalon.");
  const attendeeIds = [...new Set([ownerId, ...rawAttendees as string[]])];
  const title = clean(form, "title", 200);
  const kind = field(form, "kind");
  const color = field(form, "color");
  const description = clean(form, "description", 4000);
  const location = clean(form, "location", 300);
  const meetingUrl = clean(form, "meeting_url", 500);
  const participants = clean(form, "participants", 1000);
  const timezone = clean(form, "timezone", 100);
  const allDay = field(form, "all_day") === "yes";
  if (!title || title.length > 200 || description.length > 4000 || location.length > 300 ||
      participants.length > 1000 || meetingUrl.length > 500 ||
      !(EVENT_KINDS as readonly string[]).includes(kind) || !(CALENDAR_COLORS as readonly string[]).includes(color))
    return invalid();
  if (meetingUrl) {
    try {
      const url = new URL(meetingUrl);
      if (url.protocol !== "https:" || !url.hostname) return invalid("Utiliza un enlace HTTPS de reunión.");
    } catch { return invalid("El enlace de reunión no es válido."); }
  }
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date()); }
  catch { return invalid("La zona horaria no es válida."); }
  let starts: Date | null;
  let ends: Date | null;
  if (allDay) {
    const first = field(form, "start_day"), last = field(form, "end_day");
    if (!isCalendarDay(first) || !isCalendarDay(last) || last < first) return invalid("Indica días válidos.");
    starts = asIso(first + "T00:00:00.000Z");
    ends = asIso(moveDay(last, 1) + "T00:00:00.000Z");
  } else {
    starts = asIso(field(form, "starts_at"));
    ends = asIso(field(form, "ends_at"));
  }
  if (!starts || !ends || ends <= starts || ends.getTime() - starts.getTime() > 30 * 86400000)
    return invalid("La hora de fin debe ser posterior al inicio (máximo 30 días).");
  const leadRaw = field(form, "lead_id"), clientRaw = field(form, "client_id");
  const leadId = uuidField(form, "lead_id"), clientId = uuidField(form, "client_id");
  if ((leadRaw && !leadId) || (clientRaw && !clientId)) return invalid("El lead o cliente indicado es inválido.");
  const payload = {
    title, kind, color, description, location, meeting_url: meetingUrl,
    participants, timezone, all_day: allDay, attendee_ids: attendeeIds,
    owner_id: ownerId, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
    lead_id: leadId, client_id: clientId,
  };
  const idRaw = field(form, "id"), id = uuidField(form, "id");
  if (idRaw && !id) return invalid();
  if (clientId) {
    // An event can only gain a customer tag backed by a confirmed CRM sale.
    // Verify against owner-RLS sales, not a client name or client_id supplied by the browser.
    const { data: purchases, error: purchaseError } = await supabase.from("crm_sales")
      .select("id").eq("client_id", clientId).eq("status", "confirmed").limit(1);
    if (purchaseError) return dbError(purchaseError);
    if (!purchases?.length) {
      // Historical events can retain an unchanged client association when edited.
      // Do not allow creating or switching to a non-purchasing client.
      if (!id) return invalid("Solo puedes etiquetar clientes que tengan una compra confirmada.");
      const { data: existing, error: existingError } = await supabase.from("crm_events")
        .select("client_id").eq("id", id).maybeSingle();
      if (existingError) return dbError(existingError);
      if (!existing || existing.client_id !== clientId)
        return invalid("Solo puedes etiquetar clientes que tengan una compra confirmada.");
    }
  }
  if (id) {
    const version = versionOf(form);
    if (!version) return invalid("Actualiza la pantalla e inténtalo de nuevo.");
    const { data, error } = await supabase.from("crm_events").update(payload)
      .eq("id", id).eq("version", version).eq("status", "scheduled").select("id").maybeSingle();
    if (error) return dbError(error);
    if (!data) return { status: "conflict", message: "El evento cambió en otra sesión. Actualiza el calendario." };
  } else {
    const { error } = await supabase.from("crm_events").insert({ ...payload, status: "scheduled" });
    if (error) return dbError(error);
  }
  revalidatePath(PATH);
  return ok(id ? "Evento actualizado para ambos propietarios." : "Evento creado en el calendario compartido.");
}

export async function cancelCalendarEvent(form: FormData): Promise<CalendarResult> {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"), version = versionOf(form);
  if (!id || !version) return invalid();
  const { data, error } = await supabase.from("crm_events").update({ status: "cancelled" })
    .eq("id", id).eq("version", version).eq("status", "scheduled").select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return { status: "conflict", message: "El evento cambió. Actualiza el calendario." };
  revalidatePath(PATH);
  return ok("Evento cancelado. Se conservó el historial.");
}

export async function saveCalendarBanner(form: FormData): Promise<CalendarResult> {
  const { supabase } = await ownerForAction();
  const day = field(form, "day"), title = clean(form, "title", 120);
  const subtitle = clean(form, "subtitle", 300), emoji = clean(form, "emoji", 16) || "🎉";
  const theme = field(form, "theme");
  if (!isCalendarDay(day) || !title || title.length > 120 || subtitle.length > 300 ||
      emoji.length > 16 || !(BANNER_THEMES as readonly string[]).includes(theme)) return invalid();
  const idRaw = field(form, "id"), id = uuidField(form, "id");
  if (idRaw && !id) return invalid();
  const payload = { day, title, subtitle, emoji, theme };
  if (id) {
    const version = versionOf(form);
    if (!version) return invalid();
    const { data, error } = await supabase.from("crm_calendar_banners").update(payload)
      .eq("id", id).eq("version", version).select("id").maybeSingle();
    if (error) return dbError(error);
    if (!data) return { status: "conflict", message: "El banner cambió. Actualiza el calendario." };
  } else {
    const { error } = await supabase.from("crm_calendar_banners").insert(payload);
    if (error) return dbError(error);
  }
  revalidatePath(PATH);
  return ok("Banner guardado y visible para Miguel y Samuel.");
}

export async function deleteCalendarBanner(form: FormData): Promise<CalendarResult> {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"), version = versionOf(form);
  if (!id || !version) return invalid();
  const { data, error } = await supabase.from("crm_calendar_banners")
    .delete().eq("id", id).eq("version", version).select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return { status: "conflict", message: "El banner cambió. Actualiza el calendario." };
  revalidatePath(PATH);
  return ok("Banner eliminado.");
}
