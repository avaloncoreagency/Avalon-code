#!/usr/bin/env bash
# Avalon Direct Bridge — package a code delivery for review WITHOUT GitHub (for Codex, Claude, managers).
#
#   scripts/project-bridge/make-delivery.sh <out-dir> <id> <author> <module> <version> <base-commit> <branch> \
#       "<test command>" <passed> <failed> "<integration instructions>"
#
# Produces <out-dir>/<id>/ with: <id>.bundle (base..branch), <id>.patch, SHA256SUMS and DELIVERY.json
# (docs/dev-bridge/DELIVERY_CONTRACT.md). The receiver checks it with scripts/project-bridge/verify-delivery.mjs.
set -euo pipefail
[ $# -eq 11 ] || { sed -n '2,9p' "$0"; exit 2; }
out="$1"; id="$2"; author="$3"; module="$4"; version="$5"; base="$6"; branch="$7"; cmd="$8"; passed="$9"; failed="${10}"; howto="${11}"
cd "$(git rev-parse --show-toplevel)"
base_full="$(git rev-parse "$base^{commit}")"; tip="$(git rev-parse "$branch^{commit}")"
git merge-base --is-ancestor "$base_full" "$tip" || { echo "base is not an ancestor of $branch"; exit 2; }
d="$out/$id"; mkdir -p "$d"
git bundle create -q "$d/$id.bundle" "$base_full..$branch" 2>/dev/null || git bundle create "$d/$id.bundle" "$base_full..$branch"
git format-patch -q --stdout "$base_full..$tip" > "$d/$id.patch"
node -e '
  const [d,id,author,module,version,base,tip,cmd,passed,failed,howto]=process.argv.slice(1);
  const {execFileSync}=require("child_process"); const fs=require("fs"); const crypto=require("crypto");
  const h=f=>crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const changes=execFileSync("git",["diff","--name-only",base+".."+tip],{encoding:"utf8"}).trim().split("\n").filter(Boolean);
  const pkgDiff=changes.includes("package.json")?execFileSync("git",["diff",base+".."+tip,"--","package.json"],{encoding:"utf8"}):"";
  const deps=[...pkgDiff.matchAll(/^\+\s+"([^"]+)":\s*"([^"]+)"/gm)].map(m=>m[1]+"@"+m[2]);
  const m={id,author,module,version,base_commit:base,delivery_commit:tip,created_at:new Date().toISOString(),
    artifact:{file:id+".bundle",sha256:h(`${d}/${id}.bundle`)},patch:{file:id+".patch",sha256:h(`${d}/${id}.patch`)},
    changes,dependencies:deps,tests:{command:cmd,passed:Number(passed),failed:Number(failed)},
    review_status:"submitted",evidence:[],integration_instructions:howto};
  fs.writeFileSync(`${d}/DELIVERY.json`,JSON.stringify(m,null,2)+"\n");
' "$d" "$id" "$author" "$module" "$version" "$base_full" "$tip" "$cmd" "$passed" "$failed" "$howto"
(cd "$d" && sha256sum "$id.bundle" "$id.patch" DELIVERY.json > SHA256SUMS)
echo "OK delivery $d ($(git rev-list --count "$base_full..$tip") commits, $(wc -c < "$d/$id.bundle") bytes)"
