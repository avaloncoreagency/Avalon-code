#!/usr/bin/env bash
# Avalon OS — Git backups that do NOT depend on GitHub.
#
#   scripts/devops/gitless-backup.sh full  <out-dir>              # every branch + tag, full history
#   scripts/devops/gitless-backup.sh incr  <out-dir> <base-ref>   # only commits after <base-ref> (e.g. backup/last-full)
#   scripts/devops/gitless-backup.sh verify <bundle> [<base-repo>]
#
# Produces <name>.bundle, <name>.bundle.sha256, <name>.manifest.json and <name>.patch (incremental only).
# Every bundle is verified by cloning or fetching it into a throw-away repository before it is reported as OK.
# Secrets are never included: bundles contain only committed Git objects, and a guard refuses to back up if a tracked
# file looks like a secret (.env*, keys). The previous backup is never deleted or overwritten.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mode="${1:-}"; out="${2:-}"
[ -n "$mode" ] || { sed -n '2,12p' "$0"; exit 2; }
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
head="$(git rev-parse HEAD)"; branch="$(git rev-parse --abbrev-ref HEAD)"

guard_secrets() {
  local bad
  bad="$(git ls-files | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|id_rsa|id_ed25519|credentials\.json$' | grep -v '\.env\.example$' || true)"
  if [ -n "$bad" ]; then echo "REFUSED: tracked files look like secrets:"; echo "$bad"; exit 3; fi
}

manifest() { # $1 bundle, $2 kind, $3 base
  local b="$1" sum; sum="$(sha256sum "$b" | cut -d' ' -f1)"
  echo "$sum  $(basename "$b")" > "$b.sha256"
  node -e '
    const [b,kind,base,head,branch,stamp,sum,heads,count]=process.argv.slice(1);
    const m={kind,created_at:stamp,repository:"Avalon OS (avalon-code)",branch,head,base:base||null,sha256:sum,
      bytes:require("fs").statSync(b).size,commits_included:Number(count),
      refs:heads.trim().split("\n").filter(Boolean).map(l=>{const [sha,ref]=l.split(" ");return {sha,ref};}),
      restore: kind==="full" ? `git clone ${require("path").basename(b)} avalon-os -b ${branch}` :
        `cd <repo that contains ${base}> && git fetch ${require("path").basename(b)} "+refs/heads/*:refs/remotes/backup/*"`};
    require("fs").writeFileSync(b.replace(/\.bundle$/,".manifest.json"), JSON.stringify(m,null,2)+"\n");
  ' "$b" "$2" "${3:-}" "$head" "$branch" "$stamp" "$sum" "$(git bundle list-heads "$b")" "$(if [ -n "${3:-}" ]; then git rev-list --count "$3..$head"; else git rev-list --count --all; fi)"
}

case "$mode" in
  full)
    [ -n "$out" ] || { echo "usage: full <out-dir>"; exit 2; }
    guard_secrets; mkdir -p "$out"
    b="$out/avalon-os-full-$stamp.bundle"
    git bundle create "$b" --all
    t="$(mktemp -d)"; git clone -q "$b" "$t/r" -b "$branch"
    [ "$(git -C "$t/r" rev-parse HEAD^{tree})" = "$(git rev-parse HEAD^{tree})" ] || { echo "VERIFY FAILED"; exit 4; }
    rm -rf "$t"
    manifest "$b" full
    git tag -f "backup/last-full" "$head" >/dev/null
    echo "OK full bundle $b (restored clone has an identical tree)";;
  incr)
    base="${3:-}"; [ -n "$out" ] && [ -n "$base" ] || { echo "usage: incr <out-dir> <base-ref>"; exit 2; }
    guard_secrets; mkdir -p "$out"
    git merge-base --is-ancestor "$base" "$head" || { echo "base $base is not an ancestor of HEAD"; exit 2; }
    n="$(git rev-list --count "$base..$head")"; [ "$n" -gt 0 ] || { echo "nothing new since $base"; exit 0; }
    b="$out/avalon-os-incr-$stamp.bundle"
    git bundle create "$b" "$base..$branch"
    git format-patch -q --stdout "$base..$head" > "${b%.bundle}.patch"
    # Verify: a clone of the BASE (from this repo) + the incremental bundle reproduces HEAD exactly.
    t="$(mktemp -d)"; git clone -q --no-checkout . "$t/r"; git -C "$t/r" checkout -q --detach "$(git rev-parse "$base")"
    git -C "$t/r" fetch -q "$b" "refs/heads/$branch:refs/heads/restored"
    [ "$(git -C "$t/r" rev-parse restored)" = "$head" ] || { echo "VERIFY FAILED"; exit 4; }
    rm -rf "$t"
    manifest "$b" incremental "$(git rev-parse "$base")"
    git tag -f "backup/last-incr" "$head" >/dev/null
    echo "OK incremental bundle $b ($n commits after $(git rev-parse --short "$base"); fetch into the base reproduces $(git rev-parse --short "$head"))";;
  verify)
    b="$out"; [ -f "$b" ] || { echo "usage: verify <bundle>"; exit 2; }
    [ -f "$b.sha256" ] && (cd "$(dirname "$b")" && sha256sum -c "$(basename "$b").sha256")
    git bundle verify "$b" >/dev/null && echo "OK git bundle verify $(basename "$b")";;
  *) echo "unknown mode $mode"; exit 2;;
esac
