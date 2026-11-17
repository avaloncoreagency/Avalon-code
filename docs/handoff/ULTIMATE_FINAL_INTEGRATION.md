# Avalon Ultimate — integration checkpoint

## Discovery (2026-11-16 America/New_York)

- Main: c9a3fec80422c435d6a3de36b7309947cd32ccd5.
- Original delivery: PR #222, claude/avalon-ultimate, fcd9391d5e85624cdaaeaccd406ada4846c4f401; implementation 5b7fe13265c4f1fee8737400d75a499bd10abbcc.
- Recovered unchanged into codex/ultimate-final-integration. No CRM, private routes, migration or auth edits. PR #221 backend and #220 CRM frontend remain separate.
- Graphify index 343c57c predates Ultimate; live source is authoritative.

| Piece | Observed status |
| --- | --- |
| Ignition, Launch, Engine, Tree | Implemented in original PR; not on main. Existing HTML controls and lazy three.js renderer reused. |
| Eight service pages, quote form, showroom | Existing integrated public routes retained. |
| Industries, projects | Existing homepage sections; no dedicated pages; not missing navigation. |
| Higgsfield media | 27 top-level WebP/MP4 assets decode with ffprobe; original job references in HIGGSFIELD_MEDIA.md. Current derivatives are 640–2400px images and 720–1600px videos, not 8K. |
| New dark cinematic masters | Proposed only. No generation, no spend. Historical estimate about 410 credits is NOT a current quote. |
| Media license/account entitlement | Historical provenance recorded, current entitlement not independently verified. |
| Original Preview | dpl_F5iJkwbsmnvGrN5g1NvR73HWsbUb READY at 5b7fe13; fcd9391 docs-only deployment canceled. No visual access in this session. |

## Confirmed code defects and correction

Projected controls retained inline transform, opacity and pointer-events when the watchdog disposed the renderer. Fallback layout also stayed pinned on no-GPU/no-data-saver environments if motion preference was normal. Added bus reset notification, removal of projected styles/tabindex, normal-flow fallback CSS and explicit focus outlines. Live controls outside the active stage leave the tab order. Motion preference changes and context loss deactivate the renderer; boot does not start animation while hidden.

Tests cover bus reset/unsubscription and DOM projection cleanup. Existing public E2E retains isolated quote→pending prospect flow and adds eight viewport sizes, actual forced-software WebGL selection, and dynamic reduced-motion fallback. Forced rendering is CI only, not evidence of physical-device smoothness or INP.

## Validation and release gate

Local 632 unit tests passed; typecheck and lint passed (one pre-existing img warning). Final build/CI results belong to the published SHA, to be recorded in PR. Original PR had 5 green workflows, which do not certify these changes.

Preview access is BLOCKED: Vercel authentication is required. The connector's temporary share-link operation was rejected by automatic approval review because it expands access. Do not retry via another mechanism, disable protection or merge without Preview acceptance. A scoped temporary access-link authorization is required before visual Preview validation. Existing browser CI remains permitted.

Not verified: Safari/iPhone hardware; real-device INP, WebGL LCP/CLS; new Higgsfield dark assets/license; production of this branch. Claude's Lighthouse figures are reported historical measurements, not independently reproduced here. No paid generation or provider activation.

## Next action

Review this public-only integration against #222, confirm CI at exact SHA, authorize the 23-hour Preview access link, then complete deployed visual acceptance before merge. Do not merge #221/#220 as part of this public task. Preserve original Claude branch. No production deployment declared.
