# Dev Bridge 3.0 — verifiable work ledger

Status: **code complete on a draft PR, NOT active.**
- The migration `supabase/migrations/20261123120000_dev_bridge_ledger.sql` is review-only. It needs independent owner approval before anyone applies it to production.
- No agent token exists until each owner issues one for their own agents.

Dev Bridge 3.0 extends Dev Bridge 2.0 (`/admin/dev-bridge`: GitHub/Vercel/Supabase snapshot, handoff protocol); it does not replace it. It reuses the 2.0 GitHub snapshot for imports. It does not duplicate `crm_timeline`: its events live in their own append-only table.

## What it records, and what it never records

| Records | Never records |
|---|---|
| What an agent **sends** through the session CLI: start, pause, resume, checkpoint, blocked, interrupted, stop, plus activity claims (test, build, commit…). | Keystrokes, screenshots, screen or audio recording, file contents, clipboard. |
| Hours that each owner **declares** for themself. | Private ChatGPT/Claude/Codex chats. Avalon does not read any chat. A handoff exists only if a person pastes it. |
| Handoffs that a person **pastes** (ChatGPT project chats, departments). | Hours derived from commits or from branch names. |
| GitHub facts from the authenticated 2.0 snapshot, with their **original dates**. | Anything from accounts whose owner has not issued a token for them. |

## Identities

Each owner (Miguel, Samuel) claims his label once from his own owner account (`dev_bridge_claim_owner`). Rules:
- A label already claimed by another account cannot be taken.
- An account cannot hold two labels.

Agents:

| Agent id | Owner | Tool |
|---|---|---|
| `miguel.claude` | Miguel | Claude Code |
| `miguel.codex` | Miguel | Codex |
| `samuel.claude` | Samuel | Claude Code |
| `samuel.codex` | Samuel | Codex |

Only the agent's owner can issue, rotate or revoke its token; the database enforces this, not just the UI. Miguel cannot activate Samuel's agents, and the reverse is also true.

Branch names, commit authors and commit messages are **never** treated as proof of identity.

## Connecting an agent (per owner, per agent)

1. Open `/admin/dev-bridge/ledger` → **Agent connections** → **Issue token**. The token (`avd_…`) is shown once. Only its sha256 is stored. It expires after 1–90 days.
2. Store it **only** as a secret in that agent's environment: `AVALON_BRIDGE_AGENT_TOKEN`. Optionally set `AVALON_BRIDGE_URL`, which defaults to `https://avaloncoreagency.com`.
   - Never commit it.
   - Never paste it into Issues or chats.
3. From the repository the agent works in:

```bash
npm run bridge:session -- start --title "Dev Bridge 3.0" --department Engineering --issue 303
```

```bash
npm run bridge:session -- event --kind test --title "npm test 812/0" --url https://github.com/<owner>/<repo>/actions/runs/<id>
```

```bash
npm run bridge:session -- pause
```

```bash
npm run bridge:session -- resume
```

```bash
npm run bridge:session -- stop --summary "What was done" --next "Exact next action"
```

Other commands: `checkpoint --note`, `blocked --note`, `interrupted`, `status`, `flush`.

**Offline behaviour**
- Every command first appends to `.dev-bridge/outbox.jsonl`, which is gitignored and has mode 0600. Network or 5xx failures keep the item there, and the next command or `flush` resends it in order.
- The server deduplicates by idempotency key, so resending is harmless.
- A session started offline gets a local `pending:` id. It is replaced by the server id on flush.

**Revoking**
- **Revoke** in the same table stops the token immediately.
- Its prefix and timestamps stay as audit.

## Time: four separate kinds, never mixed

| Kind | Source | Evidence | How it is computed |
|---|---|---|---|
| A. Declared hours | Owner form (`dev_bridge_declare_time`) | SELF_REPORTED | Sum of the latest version of each entry in the period. A correction appends a new row (`supersedes` plus a reason of at least 5 characters). The original is never edited. |
| B. Session time (observed) | Agent session events | VERIFIED (server clock) | See the formula below. |
| C. Per-tool session time | Same as B | VERIFIED | B split by tool (Claude Code / Codex). **These can add up to more than B**: two agents working in parallel count once in B and once per tool in C. The UI shows both separately and does not add them. |
| D. Unknown | — | — | Anything not sent is not counted. "No records" ≠ "no work". |

**Session formula**
- Session events use the database `now()` for both `occurred_at` and `recorded_at`. The client clock is ignored for time accounting.
- `start` and `resume` open an interval. `pause`, `blocked`, `interrupted` and `stop` close it.
- Intervals are clipped to the period. Covered time = `|∪ intervals|`, the measure of their union. Overlaps (concurrent sessions) count once.
- An **open** session counts only up to its last received event, never "until now". A forgotten `stop` therefore never inflates time.
- Durations under 60 s are shown as `<1 min`. They are never rounded up to a minute, nor down to zero.

**Period presets:** today, the last 7 days, the last 30 days, and all history, in America/New_York calendar days.

## Evidence states

| State | Meaning |
|---|---|
| VERIFIED | Measured or enforced by the server: session events, identity claims, token issuance, verified commitments. |
| SELF_REPORTED | A claim by an owner or agent: activity events from the CLI, declared hours, handoffs without a link. |
| IMPORTED | A pasted handoff that includes an `https://` evidence link. |
| INFERRED | GitHub item attributed through **exactly one** `owner:miguel` / `owner:samuel` labelled Issue. |
| UNKNOWN | GitHub item without unambiguous attribution. All commits stay UNKNOWN. |

## Handoff format (ChatGPT projects, departments, manual)

Paste this block into **Record work → ChatGPT handoff**. Spanish keys also work: Propietario, Departamento, Fecha, Tarea, Decisiones, Trabajo realizado, Documentos, Evidencia, Estado, Próximo paso.

```
Owner: Miguel
Department: Marketing
Date: 2026-11-23
Task: Q1 campaign brief
Decisions: Focus on dental clinics in Miami
Work done: Drafted brief and 3 headline options
Documents: <link to the doc>
Evidence: https://…
Status: ready for review
Next step: Samuel reviews headlines
```

- It is recorded as the **caller's own** work. Nobody can record work in the other owner's name.
- Pasting the same text twice is idempotent.

## Commitments

States: pending, in_progress, blocked, ready_for_review, completed, verified, cancelled.
- **Blocked**, **cancelled**, **reschedule** and **reopen** require a reason.
- Only the responsible owner moves a commitment to ready_for_review or completed.
- **Verified** requires an evidence link and, once both owners have claimed their identity, the **other** owner. An agent's statement is never verification.
- Every transition is appended to `dev_bridge_commitment_events`. Concurrent edits are rejected through the version number.

## Exports

`/api/dev-bridge/export?kind=events|sessions|hours|commitments&period=today|7d|30d|all` returns CSV.
- Owner session only, with `Cache-Control: private, no-store`.
- Values are quoted, and spreadsheet formulas (`= + - @`) are neutralised.
- Exports are private. **Never commit them or attach them to public Issues/PRs:** this repository is public.

## Security model (review checklist)

**Tables**
- `dev_bridge_people`, `dev_bridge_agents`, `dev_bridge_sessions`, `dev_bridge_events`, `dev_bridge_time_entries`, `dev_bridge_commitments`, `dev_bridge_commitment_events`.
- RLS is on for all of them. Only owners can read. No direct insert/update/delete for any role. `token_sha256` is not selectable (column grants).

**Writes go only through SECURITY DEFINER RPCs**
- Owner RPCs start with `auth.uid() is not null and crm_private.is_owner()`.
- The one anonymous RPC, `dev_bridge_agent_event(text, jsonb)`:
  - is token-hash gated (expired and revoked tokens are rejected) and rate-limited to 600 per hour per agent;
  - prefixes idempotency keys per agent;
  - rejects a session that belongs to another agent with `session_not_found`.
- It is allowlisted with justification in `scripts/security/definer-audit.cjs` and `tests/security.test.cjs`.

**Middleware**
- `/api/dev-bridge/v1/events` (POST only) is the second machine route that bypasses the owner-cookie gate, after `/api/creative-bridge/deliveries`.
- The route accepts only `Bearer avd_…`, caps the body at 16 KB, and uses the publishable key without a session. It never uses `service_role` or cookies.
- `tests/dev-bridge-ledger.test.cjs` pins the exact list of bypasses.

**Prohibited by design:** hidden monitoring, keylogging, permanent recording, reading private chats, access to other people's accounts, sharing tokens.

**No automatic decisions.** No metric decides ownership, compensation or the economic value of work. The comparison view shows facts side by side, never a score or ranking.

## Retention

Events are append-only for auditability.
- There is no automatic deletion job. Adding one is a later owner decision.
- Correcting hours appends a superseding row; nothing is overwritten.
- Revoking a token keeps its prefix and timestamps.

## Tests

| File | Covers |
|---|---|
| `tests/dev-bridge-ledger.test.cjs` | Pure math: pauses, concurrency without double counting, corrections, CSV, handoff parsing, GitHub mapping, periods. Session CLI offline queue and flush. Middleware bypass pin. |
| `tests/dev-bridge-ledger.database.cjs` (PGlite) | Identity claims, owner-only token issuance, impersonation, replay, revocation, server time, rate and size limits, hours and corrections, handoffs, GitHub import idempotency, commitment state machine and cross-owner verification. |
| `tests/dev-bridge-ledger.browser.cjs` (`DEV_BRIDGE_BROWSER=1`, after `npm run build`) | Synthetic end to end at 1440 and 390 px (Chromium emulation, **not** physical Safari): page → real API route → real session CLI (offline then online) → ledger. Also: forged token rejected, private CSV export, bilingual UI, no horizontal page scroll. |

CI: `.github/workflows/dev-bridge-validate.yml` runs all three. That workflow is **paused** (manual dispatch only) since the 2026-11-10 recovery mode; it was not re-enabled.

## Activation (requires owner approvals; not done by any agent)

1. Independent review and approval of the migration, by an owner other than the PR author's principal.
2. Apply `20261123120000_dev_bridge_ledger.sql` to production and re-run the Supabase advisors.
3. Merge and deploy through the normal release process.
4. Miguel and Samuel each claim their identity in `/admin/dev-bridge/ledger`.
5. Each owner issues tokens **only** for his own agents and stores them as that agent's environment secret.
