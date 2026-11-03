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
