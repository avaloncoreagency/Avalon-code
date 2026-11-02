import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const name = "avalon-password-flow";
function sign(value: string) {
  const secret = process.env.AUTH_FLOW_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_FLOW_SECRET is required");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function grantPasswordFlow(userId: string, type: "invite" | "recovery") {
  const value = `${userId}:${type}:${Date.now() + 15 * 60_000}`;
  (await cookies()).set(name, `${value}:${sign(value)}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/admin", maxAge: 900 });
}
export async function validPasswordFlow(userId: string, type: "invite" | "recovery") {
  const parts = (await cookies()).get(name)?.value.split(":");
  if (!parts || parts.length !== 4 || parts[0] !== userId || parts[1] !== type || Number(parts[2]) <= Date.now()) return false;
  try {
    const expected = Buffer.from(sign(parts.slice(0, 3).join(":")));
    const actual = Buffer.from(parts[3]);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
export async function clearPasswordFlow() { (await cookies()).set(name, "", { path: "/admin", maxAge: 0 }); }
