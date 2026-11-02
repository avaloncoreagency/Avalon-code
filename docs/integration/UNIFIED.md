# Avalon OS unified integration — 2026-11-02

Base main: a3cd13d. Branch: integration/avalon-os-unified. No original branch rewritten.

Included: main's HUD/global search/CSV and HTML tools; password fix b9a6af4; Samuel's CRM branch with its API, forms, domain logic and tests; Dev Bridge 03305ae; profile branch documentation. Shared-shell conflict resolved in favor of the current authenticated SuiteChrome, which already implements the upper-right profile. Auth regression conflict combined password, module and bridge checks. Old tests forbidding CRM files were replaced with integrated coverage.

The unapplied CRM migration was moved from 20261102040501 to 20261102081000: it depends on membership foundation 20261102053022. SQL content unchanged. Before remote application, inspect migration history: if the old CRM version was ever applied, reconcile the ledger administratively instead of running it again. No remote migration was applied.

## Central client operations model
Existing os_projects is the canonical service project registry. Existing module children reference project_id; os_audit records changes. Shared settings.operations stores CRM lead UUID (validated against CRM before save), responsible display label, HTTPS project/repository URLs, deployment platform, authorized-integration references, resource references, task notes and important-date notes. These are operational records, not granted permissions or connected API capabilities. Created_by remains the verified user UUID. Version comparisons prevent lost updates; metadata saves preserve other module settings. CRM is a separate commercial module; Dev Bridge follows internal engineering only.

This initial operational record uses bounded notes for tasks/resources/dates; it is not a full task scheduler or file-storage service. Client selection currently accepts a CRM UUID, not a searchable directory. Existing editors/exporters remain for Avalon-managed local resources. External site editing, deployments, conversation usage and billing require authorized connectors; no such operations are simulated. Archive through existing status control preserves history; destructive deletion is not offered.

## Verification and release
Local unit, bridge, Auth HTTP, CRM PostgreSQL and CRM browser suites provide synthetic evidence. Unified database test applies all migrations in sorted order and verifies OS RLS/triggers plus persisted metadata and archive. CRM browser checks 390px and desktop, persistence and navigation. Real owner sign-in requires each owner using their own credentials.

Live Supabase inspection: the selected connection's list_branches returned only main; the old thdgrczotqapnvcjefoi reference did not return keys via the other connection. This does not prove deletion; access or branch restoration must be resolved. Do not substitute production. Preview builds explicitly reject production Supabase reference. Vercel configuration must be limited to integration branch Preview; publishable configuration may be copied from the old test branch. AUTH_FLOW_SECRET, email redirects and a reachable staging database must be verified before invitations/recovery/live CRM acceptance. Bridge runtime sources remain UNKNOWN without scoped credentials.

## Rollback and domain
Review PR against main; no automatic merge or production release. Before release, back up database, inspect applied migration versions, run staging acceptance and obtain owner approval. Keep existing production deployment for rollback. Roll code back to prior approved commit; never drop CRM tables or delete client records to reverse deployment. The new operational metadata is additive within existing settings; older code can ignore it. Keep the public storefront unchanged. Configure production APP_ORIGIN=https://avaloncoreagency.com only during separately authorized publication and allow exact Auth callbacks. Do not publish merely because Preview build is READY.
