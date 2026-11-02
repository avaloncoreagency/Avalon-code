# Avalon OS v1 — Stabilization and performance plan

Status: engineering specification, not implementation. Updated 2026-11-01.
Scope: Preview/testing branch only. Do not merge to main, deploy production, change real users, or alter live Supabase without separate review.

## Evidence and index freshness
- GitHub PR #4 head: `2412fd011290b94d8297178b39aeb87a84d8e147`; base: `feature/avalon-auth-rls`. Open, not merged.
- Graphify indexed `4c55c5054db1d91d10ff338dbd345ba62745f2ff`, 81 nodes and 74 edges; index is not the PR head. Its apparent absence of login/HUD is not evidence those files are absent from the PR.
- Graphify connector currently exposes graph querying but no index refresh/rebuild action. Refresh/switch indexed branch in Graphify UI and verify indexed commit before drawing architecture conclusions.
- No iPhone field performance measurements have been collected. Avoid claiming targets are achieved.

## Six engineering workstreams

1. **Graphify freshness**: index PR head, verify commit SHA and file coverage for `src/app/admin/**`, auth, middleware, suite UI, tests. Re-run call graph and dependency/impact analysis.
2. **Auth + Supabase**: inventory all private routes, route handlers and server actions; verify membership UUID checks and RLS; identify duplicate `getUser`/membership queries and unnecessary refreshes. No user_metadata authorization; no service key in browser. Confirm unauthorized users cannot access data directly.
3. **Lazy modules**: ensure dashboard does not eagerly import heavy module clients or fetch inactive modules' data. Prefer server components and route-level code splitting; measure before adding memoization.
4. **Central permissions + navigation**: owners Miguel and Samuel; employee permissions per module `none|view|edit|manage`, with server-side enforcement. No self-registration, no client-side permission writes. Profile menu top right with My Profile, Invite Employees, Manage Access (owners only), Logout. Invitations single-use, short-lived, server-authorized and auditable; don't expose an unprotected invite endpoint.
5. **iPhone measurements**: on Preview with realistic network/device record p50/p75 navigation, LCP, INP, CLS, JS bytes, requests and duplicate Supabase calls. Targets (not actual results): dashboard <3s on representative mobile connection, profile interaction <200ms, module navigation <1s when feasible. Record test conditions.
6. **Regression + performance tests**: signed-out, employee none/view/edit/manage, owner, revoked session, forbidden direct API access, route loading and inactive module behavior. CI: lint, typecheck, build, unit/integration; add lightweight reproducible performance budgets only after baseline.

## Employee permission example (not provisioned)
- CRM: edit
- Website Designer: view
- E-commerce Designer: none
- CRM Creator: none
- AI Receptionist: view
- Marketing Hub: none

## Execution gates
- Stage A: inspect code + Graphify index; document measured baseline and exact affected files.
- Stage B: implement least-privilege permissions and top-right profile UI behind Preview-only change, with migrations reviewed separately.
- Stage C: optimize measured hotspots, add regression tests, run CI and Preview mobile verification.
- No invented benchmark numbers, no real invitations, no production deploy, no merge until manual approval.
