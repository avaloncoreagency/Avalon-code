# Integration map
main <- feature/avalon-auth-rls (PR #1).
feature/avalon-auth-rls <- auth #4, profile #5, CRM #6, HUD #7 at audit.
Bridge is isolated from auth head 24ad6e5, proposed back to auth for review; it does not merge any existing PR.
Potential conflicts: overlapping PR files, shared auth utilities, suite/navigation, types, env, CI, public surfaces and migration names. Different bases and advanced bases are warnings; mergeable=false is a confirmed conflict. Independent files are only potential safe work, never automatic permission to merge. View findings in bridge:report.
