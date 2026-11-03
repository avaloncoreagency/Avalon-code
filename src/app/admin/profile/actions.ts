"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";

const ROOT = "/admin/profile";
const days = ["mon","tue","wed","thu","fri","sat","sun"] as const;
const time = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const str = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function finish(status: string): never {
  revalidatePath(ROOT);
  revalidatePath("/admin/workspace/crm/office");
  redirect(ROOT + "?profile=" + status);
}

export async function saveStaffProfile(form: FormData) {
  const { user, supabase } = await requireOwner();
  const display_name = str(form, "display_name");
  const title = str(form, "title");
  const department = str(form, "department");
  const bio = str(form, "bio");
  const specialties = str(form, "specialties").split(",").map(x => x.trim()).filter(Boolean);
  if (!display_name || display_name.length > 80 || title.length > 80 || department.length > 80 ||
      bio.length > 600 || specialties.length > 8 || specialties.some(x => x.length > 40)) finish("invalid");
  const { error } = await supabase.from("office_profiles")
    .upsert({ user_id: user.id, display_name, title, department, bio, specialties }, { onConflict: "user_id" });
  if (error) finish("failed");
  finish("saved");
}

export async function saveStaffAvailability(form: FormData) {
  const { user, supabase } = await requireOwner();
  const timezone = str(form, "timezone");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date()); }
  catch { finish("invalid"); }
  if (timezone.length > 80) finish("invalid");
  const weekly_hours: Record<string, [string, string]> = {};
  for (const day of days) {
    if (str(form, day + "_enabled") !== "on") continue;
    const start = str(form, day + "_start");
    const end = str(form, day + "_end");
    if (!time.test(start) || !time.test(end) || start >= end) finish("invalid");
    weekly_hours[day] = [start, end];
  }
  const quiet_start = str(form, "quiet_start");
  const quiet_end = str(form, "quiet_end");
  if (!time.test(quiet_start) || !time.test(quiet_end)) finish("invalid");
  const { error } = await supabase.from("office_availability")
    .upsert({ user_id: user.id, timezone, weekly_hours, quiet_start, quiet_end }, { onConflict: "user_id" });
  if (error) finish("failed");
  finish("saved");
}

export async function addStaffTimeOff(form: FormData) {
  const { user, supabase } = await requireOwner();
  const starts_on = str(form, "starts_on");
  const ends_on = str(form, "ends_on");
  const reason = str(form, "reason");
  if (!date.test(starts_on) || !date.test(ends_on) || starts_on > ends_on || reason.length > 200 ||
      (Date.parse(ends_on) - Date.parse(starts_on)) / 86400000 > 365) finish("invalid");
  const { error } = await supabase.from("office_time_off").insert({ user_id: user.id, starts_on, ends_on, reason });
  if (error) finish("failed");
  finish("saved");
}

export async function deleteStaffTimeOff(form: FormData) {
  const { user, supabase } = await requireOwner();
  const id = str(form, "id");
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) finish("invalid");
  const { error } = await supabase.from("office_time_off").delete().eq("id", id).eq("user_id", user.id);
  if (error) finish("failed");
  finish("saved");
}
