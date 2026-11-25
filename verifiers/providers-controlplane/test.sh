#!/bin/bash
# Downstream (controlplane) cases from the providers plan, section 4.13.
# Not part of test:verifiers: run it by hand with `bash verifiers/providers-controlplane/test.sh`.
cd "$(dirname "$0")"

failures=()
passed=0
fail() { echo "x $1"; failures+=("$1"); }
pass() { echo "ok $1"; passed=$((passed + 1)); }

echo "=== Providers Controlplane Verifier ==="

missing=$(node --input-type=module -e "
  try {
    const m = await import('@pikku/core/provider')
    if (!('defineProvider' in m)) console.log('@pikku/core/provider has no export defineProvider')
  } catch (e) {
    console.log('missing API: cannot import @pikku/core/provider (' + (e.code ?? e.message) + ')')
  }
" 2>&1)
if [ -n "$missing" ]; then fail "preflight: $missing"; else pass "preflight"; fi

for addon in addons/prov-db-pg addons/prov-db-sqlite ../providers/addons/prov-ai ../providers/addons/prov-sinks; do
  (cd "$addon" && npx pikku all >/dev/null 2>&1) || fail "addon $addon: pikku all failed"
done

build() { # engine package
  rm -rf .pikku .deploy
  sed -i "s#@verifier/prov-db-[a-z]*#@verifier/prov-db-$1#" src/addons.ts
  npx pikku all --approve-providers 2>&1 &&
    npx pikku deploy plan --provider cloudflare --result-file .deploy/cloudflare/plan-result.json 2>&1
}
marker_in_bundles() { grep -rlF "$1" .deploy --include=bundle.js >/dev/null 2>&1; }
services_backup=../../.tmp/controlplane-services.bak
trap '[ ! -f "$services_backup" ] || cp "$services_backup" src/services.ts; sed -i "s#@verifier/prov-db-[a-z]*#@verifier/prov-db-pg#" src/addons.ts' EXIT

echo "--- one addon line picks the kysely engine ---"
for engine in pg sqlite; do
  upper=$(tr a-z A-Z <<<"$engine")
  other=$([ "$engine" = pg ] && echo SQLITE || echo PG)
  if ! out=$(build "$engine"); then
    fail "engine $engine: $(tail -n 3 <<<"$out" | tr '\n' ' ')"
    continue
  fi
  marker_in_bundles "PIKKU_MARKER_$upper" && pass "engine $engine: PIKKU_MARKER_$upper bundled" || fail "engine $engine: PIKKU_MARKER_$upper missing"
  marker_in_bundles "PIKKU_MARKER_$other" && fail "engine $engine: PIKKU_MARKER_$other leaked" || pass "engine $engine: PIKKU_MARKER_$other absent"
done

echo "--- per-request auditLog and events ---"
if out=$(cd . && npx tsx src/check-audit.ts 2>&1); then pass "auditLog/events"; else fail "auditLog/events: $(tail -n 3 <<<"$out" | tr '\n' ' ')"; fi

echo "--- the singleton example builds; the audited kysely per request is PKU393 ---"
if out=$(rm -rf .pikku && npx pikku all 2>&1); then pass "createSingletonServices checks existingServices.kysely and spreads existingServices"; else fail "factory examples: $(tail -n 3 <<<"$out" | tr '\n' ' ')"; fi
cp src/services.ts "$services_backup"
cp cases/audited-wire-services.ts src/services.ts
if out=$(npx pikku all 2>&1); then
  fail "audited kysely per request was accepted, expected PKU393"
elif grep -qF PKU393 <<<"$out"; then
  pass "audited kysely per request: PKU393"
else
  fail "audited kysely per request failed without PKU393: $(tail -n 2 <<<"$out" | tr '\n' ' ')"
fi
cp "$services_backup" src/services.ts

echo "=== $passed passed, ${#failures[@]} failed ==="
for f in "${failures[@]}"; do echo "  x $f"; done
if [ ${#failures[@]} -gt 0 ]; then exit 1; fi
echo "=== All tests passed ==="
