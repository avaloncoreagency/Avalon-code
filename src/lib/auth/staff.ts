import "server-only";
import { redirect } from "next/navigation";
import { getStaffState, type StaffState } from "@/lib/auth/access";
import { getOwnerSession } from "@/lib/auth/session";

export type StaffSession = Extract<StaffState, { state: "ok" }>;
export { getStaffState };

/** Employees never enter the owner-only Suite. */
export async function requireStaff(): Promise<StaffSession> {
  const staff = await getStaffState();
  if (staff.state === "mfa") redirect("/staff/mfa");
  if (staff.state !== "ok") redirect("/admin/login");
  return staff;
}

/** Owner or active employee; only two participants may read messages by RLS. */
export async function requireStaffMessenger() {
  const owner = await getOwnerSession();
  if (owner) return { ...owner, kind: "owner" as const };
  const employee = await requireStaff();
  if (!employee.permissions.can_message) redirect("/staff?status=denied");
  return { ...employee, kind: "employee" as const };
}
