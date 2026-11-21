# Effective PUBLIC EXECUTE audit — Refs #146

21 November2026. Separate Codex correction stacked over #265@d0bd58263367a3acae829a81123bfd149629ac5e. No modification of the source branch or any application/SQL/remote permission.

## Reproduced defect

The static `definer-audit.cjs` tracked only explicit `anon` and `authenticated` grants. A newly created public SECURITY DEFINER function with no explicit GRANT retained PostgreSQL's implicit PUBLIC EXECUTE, but disappeared from the audit. An explicit PUBLIC regrant was also invisible. Three of five first regression cases failed before the fix (the two existing revoke/direct-role cases passed). This was an audit false negative, not evidence of an exploited deployed function.

## Correction

Track PUBLIC and direct role ACLs separately and calculate each role's effective EXECUTE. Process CREATE/GRANT/REVOKE/default ACL events in statement order. Preserve ACL on CREATE OR REPLACE. Global and per-schema default privileges are separate; schema-only REVOKE does not remove a global default. Defaults change future definitions only.

References: [PostgreSQL default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html), [CREATE FUNCTION permissions and replacement](https://www.postgresql.org/docs/current/sql-createfunction.html).

## Evidence and limitations

- Eight isolated text regressions plus five existing gates:13/13 pass.
- New disposable PGlite test compares the scanner's result with real `has_function_privilege` for six synthetic functions across implicit grants, direct auth, PUBLIC regrant, schema/global defaults:1/1 pass.
- Current source audit:52 distinct executable public SECURITY DEFINER functions,0 ungated according to the existing reviewed classifier; the current endpoint allowlist and search_path gates remain unchanged.
- Focused lint passes. Additional exact-head CI must be inspected after publication; synthetic tests do not certify deployed authorization.

This remains a bounded source tripwire: functions are keyed by name (not overload signature), the grammar is not a complete SQL parser, role membership other than PUBLIC is not expanded, and default-ACL modelling assumes the repository migration role postgres. Other creators, quoted identifiers and unsupported SQL syntax require direct database review in an authorized isolated environment. Function gate classification is not control-flow analysis. No production SQL, advisor, live ACL or customer reads were performed for this correction.

## Integration

Review this small patch after #265, then use its exact SHA in the independent combined acceptance candidate. Do not revoke privileges just because a function appears in this audit; inspect its actual authorization contract. Rollback reverts the scanner/tests/docs patch only.

Next action: integrator reviews the static privilege model and exact-head CI; Codex runs it alongside the commercial and multi-identity negative tests in the pinned candidate. No merge/deploy.
