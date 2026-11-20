# Multiclient operations and pilot acceptance — Refs #253

## Boundary
Avalon is an owner-operated single-agency CRM, not demonstrated tenant self-service SaaS. `agency_key='avalon'` and owner RLS are intentional: Miguel and Samuel can share client records. Client association prevents accidental cross-client commercial references; it does not create separate customer logins. Do not grant customers agency owner membership. Samuel's staff portal is out of scope.

No step below authorizes provisioning, paid resources, DNS changes, invitations, data modification, migration, deployment or deletion. Obtain the corresponding approval at its execution gate. A saved URL/project row is registration, not delivery.

## Reproducible lifecycle
1. **Intake:** authorized operator verifies existing client ID and lead, agreed scope and consent. Search existing records before creation; ambiguous names require human resolution. Issue #245 contains a candidate client/lead link: do not claim it deployed. Record approved budget, technical owner and customer-facing support owner in a private register.
2. **Inventory:** record immutable client ID, Avalon product ID/module (`website`, `ecommerce`, `crm_creator`), GitHub repository ID/ref/SHA, Supabase project ref and environment, Vercel team/project ID, domain ownership and rollback SHA. Keep credentials in scoped secret storage, never in URLs/issues/CRM notes. Use scoped integration credentials, not a shared service-role key in a customer browser.
3. **Isolation gate:** independently verify account/team ownership, scoped provider permissions, Preview DB != production, private storage/download permissions, owner/non-owner and client A/B reference negatives. If customer login is requested, stop: current agency-wide owner policy does not certify customer tenancy. Decide separate projects vs a reviewed tenant authorization model before creation.
4. **Registration:** use the existing product/client link and project bridge after authorization. Preserve the existing record ID and exact environment; duplicate request must return the same product. External/reference-only projects remain reference-only until deployed source and assets are inspected. Do not create an opportunity, sale or payment merely to link a website.
5. **Domains:** verify registrant consent, DNS zone control, target project and environment, existing MX/TXT records and rollback values. Confirm both apex/www, HTTPS certificate and canonical redirect after approved DNS change. Never switch another client's domain or delete mail records.
6. **Resources/cost:** require explicit per-client budgets, accountable payer, provider usage export and recurrence inventory. A UI quota or missing cost row is not a provider hard cap. Radar pause requires app + worker + scheduler + runtime verification. No AI receptionist/chatbot is activated by QA.
7. **Delivery:** pin accepted SHA, run unit/TS/lint/build/SQL/RLS and Chromium desktop/mobile; verify actual provider deployment matches SHA. Owner accepts UI and restoration exercise on isolated environment. Record artifacts, support contact, data export/backup evidence and rollback procedure privately. READY build alone is insufficient.
8. **Retirement:** obtain retention/export approval, stop approved schedules, revoke scoped project credentials, export and verify backup, detach domains deliberately, then disable service. Delete data/resources only under separate explicit approval. Maintain an audit receipt and verify no further invocation; never cascade-delete a shared agency project for one client.

## Miguel and Samuel pilot checklist
- [ ] Same candidate full SHA, isolated Preview and DB; migration ledger reconciled; rollback/restore actually exercised.
- [ ] Each owner uses their own session; unauthenticated/non-owner denied; no shared passwords.
- [ ] Synthetic lead → client/product → quote revision → accepted quote/contract draft → verified signed contract → sale → invoice → verified payment. Quote acceptance is not a signed contract or payment.
- [ ] Duplicate submit creates no duplicate sale/invoice; stale revision rejects; disconnect leaves recoverable input and no false success.
- [ ] Cross-client attachment, project, invoice and payment references rejected; server identifies actual actor.
- [ ] Five pipeline groups approved: Nuevo / En conversación / Propuesta / Ganado / Perdido. Preserve all historical transitions. `nurture` maps to conversation with follow-up; unknown custom stages remain visible for review, never silently discarded.
- [ ] Card opens its **lead** interactive record, not Client 360. Notes/messages, photos/files, download by the other authorized owner, author/time, stage events, empty/loading/network failure, no silent truncation, no duplicate attachment on partial retry.
- [ ] Chromium 390px and desktop: text, keyboard, touch target, no unintended horizontal overflow, console/page errors checked. Safari/iPhone real still requires separate device execution.
- [ ] Radar disabled and zero outbound calls verified in app/worker; no receptionists/chatbots activated.
- [ ] Domains/TLS, backup, rollback, retention, budgets and support acknowledged by both owners.

## Current readiness
Existing: owner authorization, persistent CRM, commercial RPCs, immutable quote versions, lead note/file/stage history, deployment isolation guard, local synthetic DB/browser harness.
Not certified: full customer tenant self-service, safe hosted acceptance, provider hard spending limits, end-to-end rollback, complete five-stage card-first experience, production zero-egress Radar. Keep pilot **NOT_READY** until evidence satisfies the checklist.
