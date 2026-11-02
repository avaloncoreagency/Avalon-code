# Decisions — 2026-11-02
GitHub Issues remain canonical; no competing task database. Ownership comes from explicit labels, never commit authors. Both owners retain equal application rights.
Use existing TypeScript and Ajv (already transitive, pinned directly for schema validation). No visual dependency.
Public repository requires encrypted operational artifacts. Without BRIDGE_STATE_KEY, synchronization works but durable Actions checkpoints are unavailable. Never put private URLs or raw snapshots in public comments/logs.
No automatic merges, migrations, permissions, invitation sends or production writes. Runtime logs, detailed schema diffs, aliases and promotions not exposed by the implemented adapters remain UNKNOWN. READY means build ready only.
