# Higgsfield -> Avalon OS: contrato de entrega visual

**Owner:** creative task author (Codex or Claude Code); **review:** KENJI/REN.
**Scope:** `avaloncoreagency/Avalon-code`; Preview first, no production deployment by default.

## Real problem
Higgsfield generates media; it does **not** install the result in our Next.js application.
A finished generation, a Higgsfield link, a prompt or a green CI check is not a shipped UI.
The development log has recorded a blocked CDN download. An inaccessible asset is a blocker, not a success.

## Definition of DONE (all checks required)
1. Identify the precise target module/page and requested appearance; inspect current `main`, AGENTS.md, ownership, and open PRs. Avoid duplicating an already-merged design.
2. Decide CSS/SVG/React vs. generated media. For Higgsfield, verify the agent actually has access to that service and estimate credit cost **before** generating. No authorization or cost budget -> no generation; report the blocker and implement only approved code-only work.
3. When a generated asset is authorized, record the real completed Higgsfield job/media ID, model, license/use rights and source. Download/transfer the binary to **stable** authorized Avalon storage (or `public/media/higgsfield/` for appropriately small public assets); check media type, dimensions, file size and that the bytes are actually available. Do not hotlink short-lived CloudFront/signed job URLs or commit secrets. Video hosting/storage or new database policies require a separate approved change.
4. Integrate the asset or CSS/React motion into the **actual Next.js component** used by the specified route; do not stop at a mockup. Ensure owner gating on private pages and never bypass RLS. For images provide appropriate text alternatives; for video provide controls/mute/poster as appropriate; for decorative animations respect `prefers-reduced-motion`.
5. Commit in a separate feature branch and open a PR. Provide exact route(s), changed code/media paths, screenshots or video of **actual rendered Preview** on desktop and 390px mobile, and evidence that the intended effect is visible. A standalone render from Higgsfield is not Preview proof.
6. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and a browser smoke/E2E check where supported. Tie CI, browser result and deployed Preview to the **exact same SHA**. A green CI check or Vercel READY alone does not prove visual acceptance.
7. Report `IMPLEMENTED + VISUALLY VERIFIED`, `PR PENDING VISUAL QA`, or `BLOCKED` (with exact reason). Never say the whole Avalon suite was redesigned when only one page or shell component changed.

## Expected PR evidence
- **Request:** the owner's exact design / animation / Higgsfield work.
- **Target:** route + component, before/after behavior on desktop and mobile.
- **Higgsfield:** real completed job ID and owned stable asset path; or explicitly **no asset generated**.
- **Deployment:** SHA + isolated Preview URL + screenshot/browser smoke result.
- **Safety:** reduced motion, no broken content, no extra API cost, no new keys or permissions, rollback instructions.
- **Blockers:** missing provider access, unavailable CDN download, missing approved storage or missing staging environment must remain OPEN and visible.

## Initial increment (2026-11-03)
The first PR adds code-only kinetic accents in the existing protected HUD shell: an animated topbar signal, a pulse for the active navigation item and a gentle sheen on dashboard module cards. No Higgsfield asset is claimed. All new motion is disabled or static for users who request reduced motion.

**Roll back:** revert the feature PR/commit; no schema, environment or production state is involved.

## Future asset bridge (not implemented by this document)
A full automated transfer from Higgsfield to Avalon requires authenticated asset retrieval, durable storage, deduplication, per-client permissions, media transformations, and an approved spend/cost policy. Treat it as a separate scoped project. Do not assume a Higgsfield connection available to ChatGPT is automatically available to Codex, Claude Code, Vercel or the production app.


## Client products: Codex / Claude Code -> Higgsfield -> Avalon libraries

### Classification, never guessed from product name
| Delivered kind | Existing Avalon module | Library route |
| --- | --- | --- |
| Client website / landing page | `website` | `/admin/workspace/website-designer` |
| Online store | `ecommerce` | `/admin/workspace/ecommerce-designer` |
| Customer CRM | `crm_creator` | `/admin/workspace/crm-creator` |
| Marketing creative only | `marketing` | `/admin/workspace/marketing-hub` |

**Existing linkage**: `os_projects.settings.operations.client_lead_id` identifies a real `crm_leads.id`. The company HUD `/admin/workspace/clients/{leadId}` lists these products. The pipeline card now links to that HUD. When a commercial sale creates `crm_clients`, its Client 360º view also reads legacy products linked by the originating lead ID. This does not invent an actual sale or payment.

### Owner-authenticated registration (first working increment)
The existing module-library "Register client project" form now accepts:
- `module`: exact destination above.
- `name`, `description`: the actual deliverable, not a speculative promise.
- `client_lead_id`: prefer a verified existing CRM lead ID; or `company_name`: exact explicitly provided company name. A unique name match reuses the existing nonarchived lead; ambiguous matches fail closed; no match creates a lead at the `new` stage with blank contact and value 0. Nothing is considered sold or qualified automatically.
- `higgsfield_ref`: stable, real website/job ID (optional for manually created projects). When set, require an authenticated company and a real HTTPS `url` or `repository` reference in the operations record. An application-side lookup attempts to reuse an existing project with the same module + Higgsfield source ID. Status is deliberately `reference_only`, never "published and verified".
- `operations.url` / `repository`: URL of the website Preview/live website or authorized source repository. If the deliverable only has an expiring link, do not register it as a stable asset.

**Agent completion steps**: build the requested creative/website in Higgsfield using the authorized account; obtain an actual completed website/job ID and usable deploy URL or git repository; verify the result; open the matching library in a **trusted authenticated owner browser**; register the project with the exact company identity; verify project HUD and its link from the pipeline; record the IDs and Preview evidence. Never script user cookies, copy session tokens to CLI, or use a service-role secret.

If Codex or Claude Code has no owner-authenticated browser or other explicitly permitted application identity, it must stop after producing a handoff containing all fields below. The delivery remains **PENDING REGISTRATION**, not DONE. A connection to Higgsfield from ChatGPT does not grant those agents permissions inside Avalon.

### Minimal agent handoff contract
```json
{
  "provider": "higgsfield",
  "source_ref": "real-higgsfield-job-or-website-id",
  "kind": "website",
  "product_name": "Client X web",
  "company_name": "Client X",
  "existing_lead_id": null,
  "description": "What was actually implemented",
  "project_url": "https://verified-deployment.example",
  "repository_url": "https://github.com/authorized/project",
  "state": "verified_preview",
  "verification": {
    "commit_sha": "actual-source-SHA",
    "desktop": "verified or blocked",
    "mobile": "verified or blocked",
    "accessibility": "verified or blocked"
  }
}
```

Unverified or missing fields are always explicit, never invented. The agent may omit fields with unavailable evidence, but cannot mark a delivery complete without its tested artifact. Do not commit customer secrets, sensitive business data, signed CDN tokens or real client records to a public GitHub repository.

### Full autonomous handback — NOT yet implemented
A background agent-to-Avalon bridge requires a separately approved machine identity and narrow scoped authentication, a receiving endpoint, idempotency backed by a database UNIQUE constraint and transactional creation/linking, HTTPS provenance and webhook validation, stable asset storage, an asynchronous reconciliation queue, and staging tests that prove no unauthorized client/lead creation. The current form-driven owner workflow does not supply these things and must not be advertised as automatic registration after a model job.

This first increment is a reversible **PR only**, uses existing tables and server owner checks, and adds no migrations or external billing. Simultaneous project registrations with the same Higgsfield ID and a failed project insert after creating a new lead are remaining non-atomic edge cases; owner-verified isolated staging is required before production acceptance.
