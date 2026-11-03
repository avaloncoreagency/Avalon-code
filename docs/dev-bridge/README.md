# Avalon Dev Bridge 2.0
Canonical work: https://github.com/avaloncoreagency/Avalon-code/issues/8
Private interface: /admin/dev-bridge. Issues own task state, Git owns code, Vercel owns deployments, Supabase owns database facts. These documents are summaries.

Run npm ci, npm run bridge:doctor, npm run bridge:sync, npm run bridge:status, npm run bridge:check. See RUNBOOK.md for connections and HANDOFF_PROTOCOL.md for continuation.

**Miguel + Samuel live cooperation:** read COOPERATION.md. The dashboard shows unlabeled/unowned PRs (not falsely attributed), overlap risk and Higgsfield delivery PRs. Agents with GitHub access run `npm run bridge:brief` for a verified start-of-session JSON summary. Hourly Actions reconciliation is best-effort; the private owner page refreshes while visible.
