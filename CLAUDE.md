# Claude Code — Avalon Core Agency

Read and follow `AGENTS.md` and `docs/dev-bridge/COOPERATION.md` before modifying this repository. These are shared operating instructions for Miguel, Samuel, Codex and Claude Code.

**At the beginning of every coding session**
1. Inspect the current remote `main` SHA and open PRs/Issues. Use an authorized GitHub connector, or `npm run bridge:brief -- --read-only` when a scoped `GH_TOKEN` is already configured. If GitHub cannot be verified, mark the state UNKNOWN and do not pretend to have recovered the other agent's work.
2. Identify the exact base commit, files being changed in other PRs, and a canonical Issue with a unique `owner:miguel` or `owner:samuel` label. A branch name or commit author is not proof of a person's identity. Unlabeled PRs remain visible but unassigned.
3. Work only on your own branch/worktree. Do not edit Codex/Samuel's active branch, force-push, merge, deploy, change Auth/RLS or use production client data to bypass a block.
4. On completion, report a PR and exact tested SHA, what is truly implemented, outstanding failures, dependencies, a concrete `Next action:` in the linked Issue, and how the other owner can continue. No repeated permission prompts for safe read-only checks or code/tests already within scope; protected infrastructure still requires the necessary authorization.

**When Higgsfield is requested:** Generating media is not installing it. For Avalon UI changes, integrate authorized real assets/code in a reviewable Next.js PR and verify rendered desktop/mobile Preview. For client websites/ecommerce/CRMs, use the signed creative-delivery process in draft PR #87 **only after** isolated staging Auth, SQL security review and agent keys are explicitly configured. A `reference_only` record is not an imported website, video or commercial delivery.

Do not paste credentials, secret environment values, customer contacts or private files into this public repository, public Issues, or prompts. Never imply one AI session can read the other's private chat. GitHub committed evidence is the shared bridge.
