# Approved pipeline acceptance contract — #253

Miguel approved five visible groups on 2026-11-19 (America/New_York): **Nuevo / En conversación / Propuesta / Ganado / Perdido**. This is the lead card's interactive company record, **not Clients 360**.

Do not migrate/delete old stages or rewrite historical events. Suggested presentation map, pending integrated UI review:
- Nuevo: `new`, `researched`, `contact-pending`.
- En conversación: `contacted`, `replied`, `qualified`, `meeting`, `diagnosed`, `nurture` (retain follow-up date).
- Propuesta: `proposal`, `negotiation`.
- Ganado: `won`; Perdido: `lost`.
- Custom stage: resolve by explicit mapping; preserve visibility in an exception area until reviewed. Never silently drop the card or auto-mark it won.

Moving to a group uses existing canonical stages and server version checks: `new`, `contacted`, `proposal`, `won`, `lost`. Keep signed-contract gate for won and reason for lost. Preserve historical stage ID/name and actor; grouping is not a new business event. Group counts must state page scope (current feed is paginated).

## Ownership boundary
`src/components/crm/lead-board.tsx`, its CSS and `crm.tsx` are claimed in open PR #236. `crm.tsx` also differs on active Claude branch `claude/upbeat-galileo-grbelq`. This QA PR does NOT modify them or create a duplicate pipeline. Integration requires the owner of that branch to adopt/reconcile the approved contract.

## Existing implementation
`LeadTimeline` opens from the board's Ficha action, reads `/crm/pipeline?lead=UUID`, combines stage history, activities and attachments; notes can include a file; download route checks owner, bytes and SHA. Author is stamped by DB, not supplied by browser. Independent database/HTTP tests in this PR verify attribution, cross-owner sharing, outsider denial and download integrity.

## Gaps to address by implementation owner
1. Make the card's primary accessible action open this lead record, distinct from edit/drag controls; no Client 360 redirect.
2. Five groups must drive header/count/drop targets/select/arrows consistently. Changing `groupPipeline()` alone leaves old stage selectors/arrows and is insufficient.
3. `LeadTimeline.who()` currently labels an unknown actor as `Sistema`. Use an honest unavailable-author label or stable identifier; absence of directory metadata is not evidence of a system action.
4. GET timeline handles `activities.error`, but non-schema `history.error` / `files.error` can silently produce empty lists with HTTP 200. Simulate a connection error on each query; show partial/error state, never certify complete history.
5. Timeline limits 200 stage events/200 activities/500 files without pagination. Provide bounded pagination or explicit truncation/next page.
6. Note+file uses two requests: upload can succeed before note fails. Preserve the receipt, allow retry of only the note, never silently upload the same file again.
7. Existing stage events + notes/files do not prove every edit is in this feed. Surface attributable lead/activity edits from existing audit data with server-safe fields, not entire snapshots with private content.
8. Keyboard focus trapping/return, mobile scroll, loading/error states and concurrent owner refresh need browser acceptance.

Acceptance: owner A opens card, writes note/uploads photo; owner B sees attributed entries and downloads identical bytes; B moves group, A sees B/time/old→new stage; stale update rejected and offline submission retained; unrelated/outsider session cannot read or write. Verify at 390px and desktop. Safari real remains a separate gate.
