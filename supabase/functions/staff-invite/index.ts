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
// AGENT PORTAL signature (presentation only, never authorization). The inviter is the AUTHENTICATED owner returned by
// /auth/v1/user; any inviter name sent in the request body is ignored. Mirrors src/lib/identity/owners.ts.
const OFFICIAL_OWNERS: Readonly<Record<string, string>> = Object.freeze({
  "avalonagencymh@gmail.com": "Miguel Hobaica", "avaloncoreagencysm@gmail.com": "Samuel Muñoz",
});
// One line, no markup or template delimiters: values are inserted into the Supabase Auth e-mail template.
const plain = (value: unknown, max: number) => typeof value === "string"
  ? value.normalize("NFC").replace(/[\u0000-\u001f\u007f<>{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  // Bound to a specific, owned application origin. Never reflect arbitrary
  // request Origin/Host into an email verification redirect.
  const projectRef = url ? new URL(url).hostname.split(".")[0] : "";
  const originsByProject: Record<string, string[]> = {
    ltbwzcrxeuczdhhtbqgm: ["https://avaloncoreagency.com","https://www.avaloncoreagency.com"],
    // Isolated Preview project only: the Vercel branch aliases of #317, #332 and #333 (never production data).
    xrtgnmuiyqmtisdrzqcg: [
      "https://avalon-core-agency-git-integration-st-dca9bb-avalon-core-agency.vercel.app",
      "https://avalon-core-agency-git-integration-st-b3d21f-avalon-core-agency.vercel.app",
      "https://avalon-core-agency-git-claude-staff-o-1ddfdf-avalon-core-agency.vercel.app",
    ],
  };
  const configuredOrigin = Deno.env.get("AVALON_OWNER_APP_ORIGIN");
  const trustedOrigins = configuredOrigin ? [configuredOrigin] : originsByProject[projectRef] ?? [];
  if (!url || !serviceKey || !publicKey || !trustedOrigins.length ||
      trustedOrigins.some(x => !/^https:\/\/[a-z0-9.-]+$/.test(x)))
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
    // Respect the owners' MFA gate even for a direct Edge Function request.
    // /auth/v1/user verified the session signature above; only now may we
    // inspect the signed token's authentication assurance level (aal).
    const factors = Array.isArray(identity.factors) ? identity.factors : [];
    const enrolled = factors.some(f => object(f)?.status === "verified");
    if (enrolled) {
      let aal = "";
      let subject = "";
      try {
        const body = token.split(".")[1];
        const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
        const claims = object(JSON.parse(atob(normalized)));
        aal = typeof claims?.aal === "string" ? claims.aal : "";
        subject = typeof claims?.sub === "string" ? claims.sub : "";
      } catch { /* Fail closed. */ }
      if (aal !== "aal2" || subject !== ownerId)
        return reply(403, { error: "mfa_required" });
    }

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
    const originRaw = object(body)?.origin;
    // A project can only issue invitations for its own trusted app domain.
    if (typeof originRaw !== "string" || !trustedOrigins.includes(originRaw))
      return reply(400, { error: "untrusted_redirect" });
    const origin = originRaw;
    if (typeof emailRaw !== "string") return reply(400, { error: "invalid_request" });
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return reply(400, { error: "invalid_request" });
    // Template data (supabase/templates/invite.html). Every key is always present so the e-mail never shows blanks.
    const lang = object(body)?.lang === "en" ? "en" : "es";
    const inviterEmail = typeof identity.email === "string" ? identity.email.trim().toLowerCase() : "";
    const official = Object.hasOwn(OFFICIAL_OWNERS, inviterEmail) ? OFFICIAL_OWNERS[inviterEmail] : "";
    const templateData = {
      inviter_name: official || "Avalon Core Agency",
      inviter_title: official ? (lang === "en" ? "Co-founder" : "Cofundador") : (lang === "en" ? "Leadership" : "Dirección"),
      invitee_name: plain(object(body)?.invitee_name, 80) || (lang === "en" ? "there" : "equipo"),
      role_label: plain(object(body)?.role_label, 60) || (lang === "en" ? "team member" : "miembro del equipo"),
      lang,
    };

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
        body: JSON.stringify({ email, data: templateData }),
      });
    const invited = object(invite.data);
    const invitedId = invited?.id;
    if (!invite.ok || typeof invitedId !== "string" || !UUID.test(invitedId))
      return reply(409, { error: "invite_not_created" });

    // Pending operator membership only. staff_portal_access is intentionally
    // NOT inserted: account remains completely locked until explicit owner activation.
    // Idempotent: a retry after a partial failure completes the enrollment, and an existing membership
    // (an owner, or an operator already enrolled) is NEVER changed — ignore-duplicates, not merge.
    const enrollment = await fetchJSON(`${url}/rest/v1/agency_memberships?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: invitedId, role: "operator" }),
    });
    if (!enrollment.ok) return reply(503, { error: "invitation_sent_enrollment_pending" });
    // Owner-only audit trail (no email or token stored). Best effort: the invitation itself already succeeded,
    // but the result tells the owner when the audit row is missing instead of claiming full success.
    const audit = await fetchJSON(`${url}/rest/v1/staff_permission_events`, {
      method: "POST",
      headers: {
        apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ actor_id: ownerId, user_id: invitedId, action: "invitation_sent" }),
    });
    return reply(200, { invited: true, requires_owner_activation: true, audited: audit.ok });
  } catch {
    return reply(503, { error: "temporarily_unavailable" });
  }
});
