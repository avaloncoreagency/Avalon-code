# CRM TITAN — Frontend acceptance and handoff

Date: 2026-11-12 (America/New_York). Branch: `codex/crm-titan-frontend`, PR #161, target: `claude/crm-intelligence`.
Initial base: `615ca832dfb085e9d50d9bdc5e26527ec4096787`.
Ownership: frontend, industry templates and browser/UI QA only. Claude owns SQL, APIs, server actions, authorization, scoring, recommendations and financial aggregation.

## Checkpoint 1 — implemented in PR #161

- Added `src/lib/crm/intel/industry-specializations.ts` with **10 distinct bilingual sector questionnaires**: Roofing, Fencing, Tattoo, Landscaping, Plumbing, Cleaning, Restaurants, Electrical, General Contractors and Other. The original HVAC, Barber and Smoke Shop definitions remain unchanged.
- Linked those sets into `templateFor` by appending to the existing general questionnaire. Every industry retains the shared general scoring inputs. Set an individual immutable template version (general-1 + sector version) and mark all 13 as specialized.
- Sector-specific questions include conditional fields, operational capacity, direct cost/revenue, inquiry handling, staffing and licensing/compliance review where relevant. Recording a compliance answer does not constitute independent verification.
- Extended `tests/crm-intel.test.cjs` to verify all 13 templates have unique question IDs, bilingual copy, valid choices and condition references; added representative conditional-path/validation tests. Updated the old test that expected the 10 industries to be generic.
- Discovery draft recovery: restored answers now rehydrate React state and conditional question visibility, while original saved answer timestamps remain the conflict-check baseline. Toggling Unknown / N/A updates conditional visibility immediately. Draft snapshots now record original answer timestamps; recovery skips any question that was changed by the other owner or lacks a trusted baseline, and warns the user instead of overwriting newer saved data. This is a code change, not a claim of a completed browser test.
- Sales desk: added a server-side literal company-name search, industry filter and filter-preserving navigation. Counters remain unfiltered agency-wide counts, intentionally. The list retains its 100-row limit and now labels possible truncation rather than implying a complete list. Fixed the 'Today' view to include earlier items from the same calendar day in the server timezone.
- Calendar: operational follow-ups link directly to canonical CRM Deal Review; linked events in the daily agenda now offer direct links to their lead/client records when the persisted IDs exist.

## Scope and deliberate limitations

- No changes to `supabase/**`, API routes, server actions, authorization helpers, scoring, financial aggregation or production.
- New sector questions **do not automatically change** lead-scoring weights, legal gating, recommendations or commission approval. Claude must explicitly review any future sector-specific rules, legal policies and use of the new data.
- Existing saved assessments and answer identifiers are preserved. Newly added templates have distinct versions; saved general answers remain accessible.
- Sales desk name/industry filters apply to the first 100 matching rows. A future pagination/search contract is needed for complete large datasets and phone/contact search.
- Existing client finance authorization is email-based in the inherited code; backend Claude owns correcting this. Do not treat the visible finance area as fully accepted until a trusted capability contract is integrated and tested.
- Form recovery's current sessionStorage implementation is an emergency fallback; a full browser QA of conditional-field restoration remains pending.
- A passing isolated CI suite is not proof of an authenticated Vercel Preview or production readiness.

## Verification and release gate

GitHub CRM workflow and PostgreSQL tests are the authoritative checks for each commit; record their final conclusions after completion. A successful older SHA does not certify the latest SHA.
Pending: authenticated Preview QA with two owners, desktop/iPhone, browser persistence and partial drafts, Client 360 financial permissions and completeness, calendar multi-user updates, Funnel Builder UX, accessibility audit.
No automatic merge, production database migration or publication is authorized by this PR.

## Next steps without file collision

1. Run a real authenticated browser regression of draft recovery (including conditional questions and offline save failures) against the current SHA.
2. Consume Claude's future `docs/handoff/CRM_BACKEND_CONTRACT.md` before touching financial-capability display or writing financial UI assertions.
3. Verify cross-owner data, all 13 questionnaires and full lead → contract → sale → client flow in an isolated authenticated Preview.
4. Integrate #161 into #160 only after green CI and review; keep #159 and production protected.
