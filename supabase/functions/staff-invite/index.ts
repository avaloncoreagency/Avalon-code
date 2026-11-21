// Owner-only Supabase Auth invitation. Deployed separately to a verified project.
// Never expose a service-role key to the browser or to Vercel NEXT_PUBLIC env.
// Every invited identity starts as an inactive operator: ONLY an owner can
// grant access in /admin/staff after email confirmation.
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "private, no-store" };
const reply = (status: number, result: Record<string, unknown>) =>
  new Response(JSON.stringify(result), { status, headers: JSON_HEADERS });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fetchJSON = async (url: string, init: RequestInit) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  let data: unknown = null;
  try { data = await response.json(); } catch { /* Never return raw API contents. */ }
  return { ok: response.ok, status: response.status, data };
};
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  // Dedicated owner-app origin, configured in Edge Function secrets.
  const origin = Deno.env.get("AVALON_OWNER_APP_ORIGIN");
  if (!url || !serviceKey || !publicKey || !origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin))
    return reply(503, { error: "invitation_not_configured" });
  const bearer = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_.~-]+$/.test(bearer)) return reply(401, { error: "unauthorized" });
  const token = bearer.slice("Bearer ".length);
  try {
    // Identity is validated by Supabase Auth itself, never decoded from untrusted JWT text.
    const user = await fetchJSON(`${url}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
    });
    const identity = object(user.data);
    const ownerId = identity?.id;
    if (!user.ok || typeof ownerId !== "string" || !UUID.test(ownerId))
      return reply(401, { error: "unauthorized" });

    // Authorize with trusted database membership; no email, metadata or client claim.
    const members = await fetchJSON(
      `${url}/rest/v1/agency_memberships?user_id=eq.${encodeURIComponent(ownerId)}&select=role&limit=1`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    if (!members.ok || !Array.isArray(members.data) ||
      object(members.data[0])?.role !== "owner")
      return reply(403, { error: "forbidden" });

    const raw = await request.text();
    if (raw.length > 1024) return reply(413, { error: "invalid_request" });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return reply(400, { error: "invalid_request" }); }
    const emailRaw = object(body)?.email;
    if (typeof emailRaw !== "string") return reply(400, { error: "invalid_request" });
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return reply(400, { error: "invalid_request" });

    // Limit total invited operators to avoid unbounded provisioning by a stolen owner session.
    const roster = await fetchJSON(
      `${url}/rest/v1/agency_memberships?role=eq.operator&select=user_id&limit=51`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
    if (!roster.ok || !Array.isArray(roster.data)) return reply(503, { error: "temporarily_unavailable" });
    if (roster.data.length >= 50) return reply(429, { error: "member_limit" });

    // Invite sends a Supabase Auth-managed verification email. It does not grant
    // any CRM, Office, messaging or casefile permissions to the new identity.
    const invite = await fetchJSON(
      `${url}/auth/v1/invite?redirect_to=${encodeURIComponent(origin + "/admin/signup")}`, {
        method: "POST",
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });
    const invited = object(invite.data);
    const invitedId = invited?.id;
    if (!invite.ok || typeof invitedId !== "string" || !UUID.test(invitedId))
      return reply(409, { error: "invite_not_created" });

    // Pending operator membership only. staff_portal_access is intentionally
    // NOT inserted: account remains completely locked until explicit owner activation.
    const enrollment = await fetchJSON(`${url}/rest/v1/agency_memberships`, {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ user_id: invitedId, role: "operator" }),
    });
    if (!enrollment.ok) return reply(503, { error: "invitation_sent_enrollment_pending" });
    return reply(200, { invited: true, requires_owner_activation: true });
  } catch {
    return reply(503, { error: "temporarily_unavailable" });
  }
});
