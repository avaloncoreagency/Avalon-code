# Avalon Bridge Integrity - read-only operational preflight

Scope: Project Bridge, Dev Bridge, Creative Bridge, and the Higgsfield delivery boundary. This does not activate a provider, deploy client software, apply SQL or consume credits.

## Operator flow

1. Run npm run bridge:health to inspect configuration presence only. CONFIGURED_UNVERIFIED means NOT verified or healthy; this command never prints credentials.
2. Run npm run bridge:doctor, then npm run bridge:sync only in an authorized environment for provider-specific Dev Bridge reads. Verify timestamps and GitHub source coverage. A public summary cannot establish CI, changed files or safe handoffs.
3. For Project Bridge, explicitly configure AVALON_BRIDGE_STORAGE_ORIGIN to the verified Supabase Storage HTTPS origin in the sender's protected environment. Example https://<isolated-project>.supabase.co is a placeholder. The server-issued upload ticket must match this origin exactly or the CLI refuses to forward its upload credentials.
4. Use the owner-only Library to issue a scoped Project Bridge token and set AVALON_BRIDGE_TOKEN securely. Submit with node scripts/project-bridge/send-project.mjs <project.zip> --url <authorized-avalon-origin> --key <stable-idempotency-key>. Repeat the same key for the same import when safely retrying.
5. An uploaded project always awaits owner review; it is not automatically accepted, processed, built or deployed. Validate against isolated Storage and RLS. The static publisher cannot build React/Next.js source projects.
6. Creative Bridge requires independently reviewed SQL, a scoped machine identity, HMAC tests and staging verification as documented in docs/CREATIVE_BRIDGE_SETUP.md. Higgsfield artifacts need actual export and permission evidence. A reference_only record is not a delivered asset.

## Failure handling

- Sender rejects invalid CLI parameters, unsafe redirects, bad ticket paths and an untrusted Storage destination. Timeouts and HTTP errors fail without logging provider response bodies.
- AVALON_BRIDGE_STORAGE_ORIGIN is deliberately required; otherwise an unexpected upload URL might receive provider-supplied credentials. Custom Storage domains can be configured explicitly.
- Missing providers are UNKNOWN or STALE, not green. No command bypasses RLS, owner approval, environment separation or commercial billing gates.
- This check cannot prove provider scopes, live health, credit balances, plan limits or deployed Preview readiness.
- Review outstanding PRs and CI before merge. Production remains unchanged.
