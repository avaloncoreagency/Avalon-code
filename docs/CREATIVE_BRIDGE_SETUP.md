# Avalon Creative Bridge — Codex / Claude Code to Avalon OS

Status: **PR candidate only**. Not provisioned, not deployed and not authorized to write production.
Owner workflow lives at `docs/HIGGSFIELD_TO_AVALON.md`.

## What the bridge does
After Codex or Claude has actually completed a Higgsfield website, ecommerce or CRM project and has a stable HTTPS project URL or authorized repository, the agent invokes one command with a private, locally held JSON handoff. A dedicated `POST /api/creative-bridge/deliveries` endpoint verifies a short-lived HMAC signature against a *non-owner*, service-specific integration key. It then requests a single transactional database RPC that:
- routes the product to `os_projects.module` = `website`, `ecommerce` or `crm_creator`;
- reuses an exact unambiguous active `crm_leads` match (or an explicitly supplied existing lead ID); creates a minimal **new-stage lead** only when no match exists;
- links `os_projects.settings.operations.client_lead_id` to that lead, so the product appears on the library, the company's `/admin/workspace/clients/{leadId}` page and later its real Client 360º if converted;
- makes project registration idempotent through a **unique partial index**, advisory lock and one SQL transaction. Replay returns an existing ID. A conflicting source reference, ambiguous company or daily quota excess fails closed.

The project status is **draft** and the Higgsfield creative status is **reference_only**. No sale, payment, client contract, external publication or asset import is claimed. It does **not** automatically embed media into Avalon's UI. To change the private UI itself, agents still commit actual assets/code to an app PR, verify Preview and follow the visual acceptance gate.

## Required integration setup, ONE TIME, separate security approval
1. Have REN/SHIN review `docs/sql/creative-bridge-registration.sql`, especially the **security-sensitive, narrow** changes proposed to `crm_private.stamp()` and `crm_private.audit()`. The current CRM triggers require owners for every write; the proposal preserves that except for one allowlisted machine `crm_leads` INSERT guarded by a private transaction-only capability, with the real machine UUID recorded in CRM audit. It is deliberately **not** a migration and is **not** applied. Use `supabase migration new creative_bridge_registration` to create a correctly ordered migration after review; copy the proposal into it. Check for duplicate Higgsfield source IDs before creating the unique index. Test the migration and negative RLS/EXECUTE grants on an **isolated Supabase branch with only synthetic records**. Do not copy production secrets to Preview or broaden ownership policies.
2. Create a **dedicated Supabase Auth machine user** in the isolated staging project. It must have NO owner/employee membership and no customer access. After applying the reviewed SQL, allowlist only its verified auth UUID and assign a synthetic owner ID in `os_private.creative_bridge_identities` with `enabled=true`; prove a different authenticated user still gets 42501. This is an admin-only one-time step, NOT performed by agents.
3. In a **staging-only** Vercel environment targeting that isolated Supabase database, and with explicit approval to configure it, provision server-only variables:
   - `AVALON_CREATIVE_BRIDGE_ENABLED=true`
   - `AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED=false`
   - `AVALON_CREATIVE_BRIDGE_OWNER_ID=<the synthetic owner UUID in staging>`
   - `AVALON_CREATIVE_BRIDGE_MACHINE_EMAIL=<the stage machine Auth email>`
   - `AVALON_CREATIVE_BRIDGE_MACHINE_PASSWORD=<its unique, long, random password>`
   - Reuse the existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the **isolated staging project only** (the public key is not a secret).
   - `AVALON_CREATIVE_BRIDGE_KEYS_JSON={"codex-main":{"agent":"codex","secret_b64":"BASE64_32_RANDOM_BYTES"},"claude-main":{"agent":"claude","secret_b64":"DIFFERENT_BASE64_32_RANDOM_BYTES"}}`
   
   Two independently generated keys, at least 32 random bytes each. The example placeholders above are not keys. Never use `NEXT_PUBLIC_*` for any secret. Only the Vercel endpoint possesses the stage **non-owner machine account credential**; neither Codex nor Claude receives it. The Auth user has no owner membership. A narrowly scoped, private `SECURITY DEFINER` routine checks its server-side allowlist before doing any write; the public RPC wrapper is `SECURITY INVOKER`. No elevated database API key is used by the app.
4. In each agent's protected secrets environment, provision only its own `AVALON_CREATIVE_BRIDGE_KEY_ID` and `AVALON_CREATIVE_BRIDGE_SECRET_B64`, plus `AVALON_CREATIVE_BRIDGE_ENDPOINT=https://<isolated-preview-origin>/api/creative-bridge/deliveries`. Never paste secrets into a prompt, GitHub PR, handoff JSON or job log. Neither agent needs Miguel/Samuel's Supabase login.
5. Confirm `src/lib/supabase/middleware.ts` allows this **one exact POST path** through its owner-cookie gate, then prove the route rejects unsigned/malformed/expired or cross-agent signed requests.
6. Prove in staging: same source delivered twice -> exactly one project and one lead; existing lead -> only link; ambiguous company -> 409 and zero writes; failed project insertion -> no orphan lead; >30 new distinct delivery IDs/24h -> refused; no-owner browser cannot access the private project page. Verify Client 360º and mobile layouts. Do not run E2E with real contacts.
7. Enable the same controlled flow in production **only after a separate authorized security/DB/secret deployment**, with exact SHA, independent review, Preview acceptance, rollback and a retention/logging policy. `AVALON_CREATIVE_BRIDGE_PRODUCTION_APPROVED` is an explicit hard gate; it must not be enabled just to make CI pass.

## Handoff format (private local file; do not commit client data)
```json
{
  "schema_version": 1,
  "provider": "higgsfield",
  "module": "website",
  "source_ref": "synthetic-higgsfield-site-123",
  "company_name": "Synthetic Demo Company",
  "existing_lead_id": null,
  "product_name": "Synthetic demo website",
  "description": "Responsive concept, completed in isolated Preview",
  "project_url": "https://preview.example.com",
  "repository_url": ""
}
```
The example URL is **not a real deployment**. `module` can be `website`, `ecommerce` or `crm_creator`. The source ref must be a **real stable ID from a completed Higgsfield result**, never a fabricated value or an expiring signed URL. `company_name` is explicit and must identify the same company as `existing_lead_id`, if supplied. URLs must be stable HTTPS URLs without credentials or query tokens; at least one URL is required. Don't include phone, email, deal value, payment data, secrets or client contact details. Never commit a real handoff JSON to a potentially public repository.

Run:
```sh
npm run creative:submit -- /private/path/to/creative-handoff.json
```
Expected success receipt: `status=reference_only`, `project_path`, `company_path`, and whether the lead/project were created. A 409 means a source identity conflict or ambiguous business. A 503 means the bridge or reviewed database routine is not enabled. **Do not retry a blocked call blindly**, create a second lead, or mark the task done.

## Source-of-truth and acceptance
- Agents may generate and publish only to their **authorized Higgsfield workspace**. This bridge does not grant Higgsfield access or generation credits.
- When the agent cannot access the official site export, it must mark **ASSET EXPORT BLOCKED**; a linked record is not an installed visual. Build visuals into Avalon through an ordinary code/asset PR with actual rendered browser evidence.
- Each completed task returns the Higgsfield job/site ID, stable destination, Avalon project path, CRM lead path, commit SHA, desktop/mobile browser proof, and explicit blockers. This is the delivery receipt, not a narrative claim.
- No runtime secret or database changes were made by writing these files. The SQL is review-only; the endpoint is **disabled by default**, including on production.
- Rollback: set `AVALON_CREATIVE_BRIDGE_ENABLED=false`; revert the code PR; the SQL proposal was never applied until separately authorized. If the reviewed SQL was subsequently applied, execute a separately reviewed down-migration (drop the RPC/unique index after checking dependencies) rather than modifying production autonomously.

## Known limitations
A signed agent key grants only registration submission; the staging server signs in as a non-owner machine Auth user which has no direct CRM access. A private allowlisted database function still needs independent security review because its controlled elevation bypasses table RLS for that one transaction. A HMAC signature verifies the configured agent, *not* independent proof that the Higgsfield artifact exists. Human/browser QA is still required before publishing or charging clients. Unlike a final delivery, a registered `reference_only` record is not an accepted or contracted project. A blocked provider or absent staging database leaves the integration unactivated; the code alone cannot bypass that gate.
