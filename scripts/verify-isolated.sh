#!/usr/bin/env bash
# One reproducible verification of Avalon OS against the ISOLATED Supabase project (never production), without GitHub.
#   scripts/verify-isolated.sh <dir with creds.json {owner, ownerB, stranger} + env.json {url, key}> [port]
# Runs, in order: unit/security suite, Code Exchange PGlite, production build (Preview env), then the real-browser E2E
# suites against `next start`: two owners, export→import round trip, Direct Bridge five tests. Evidence JSON files are
# written to <dir>; a summary is printed. Credentials are read from <dir> only (0600 file) and never printed.
set -uo pipefail
DIR="${1:?usage: verify-isolated.sh <dir> [port]}"; PORT="${2:-3100}"
URL=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/env.json")).url)' "$DIR")
KEY=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/env.json")).key)' "$DIR")
case "$URL" in *ltbwzcrxeuczdhhtbqgm*) echo "REFUSED: production Supabase project"; exit 3;; esac
cd "$(git rev-parse --show-toplevel)"
declare -A R
run() { local name="$1"; shift; echo "── $name"; if "$@" > "$DIR/log-$name.txt" 2>&1; then R[$name]=PASS; else R[$name]=FAIL; fi; grep -E "^(PASS|FAIL|BLOCKED|RESULT|SUMMARY|# pass|# fail)" "$DIR/log-$name.txt" | tail -12; }

run unit npm test
run code-exchange-pglite env NODE_PATH=./tests/qa/node_modules node --test tests/code-exchange.database.cjs
run build env NEXT_PUBLIC_SUPABASE_URL="$URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$KEY" VERCEL_ENV=preview NEXT_TELEMETRY_DISABLED=1 npx next build

NEXT_PUBLIC_SUPABASE_URL="$URL" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$KEY" AVALON_VERCEL_DEPLOY_TOKEN="${AVALON_VERCEL_DEPLOY_TOKEN:-proxy-injected}" \
  AVALON_VERCEL_TEAM_ID="${AVALON_VERCEL_TEAM_ID:-team_lHTO3wgJm0yAyexxMDmkIFW4}" NODE_USE_ENV_PROXY=1 npx next start -p "$PORT" > "$DIR/log-next.txt" 2>&1 &
APP=$!; trap 'kill $APP 2>/dev/null' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/admin/login" && break; sleep 1; done
export NODE_USE_ENV_PROXY=1 NO_PROXY=localhost,127.0.0.1
BASE="http://localhost:$PORT"
run two-owners node scripts/project-bridge/e2e-two-owners.cjs "$DIR" "$BASE"
run five-tests node scripts/project-bridge/e2e-five-tests.cjs "$DIR" "$BASE"
PID=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync(process.argv[1]+"/evidence-five-tests.json")).projectId)}catch{}' "$DIR")
[ -n "$PID" ] && run export-roundtrip node scripts/project-bridge/e2e-export-roundtrip.cjs "$DIR" "$BASE" "$PID"

echo "══ SUMMARY (commit $(git rev-parse --short HEAD))"
for k in unit code-exchange-pglite build two-owners five-tests export-roundtrip; do printf '%-22s %s\n' "$k" "${R[$k]:-NOT RUN}"; done
for k in "${R[@]}"; do [ "$k" = PASS ] || exit 1; done
