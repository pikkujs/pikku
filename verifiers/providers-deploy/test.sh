#!/bin/bash
# One project built for standalone, cloudflare-worker and cloudflare-container, with bundle greps.
cd "$(dirname "$0")"
unset CI
rm -f pikku-addons.lock

failures=()
passed=0
fail() { echo "x $1"; failures+=("$1"); }
pass() { echo "ok $1"; passed=$((passed + 1)); }

echo "=== Providers Deploy Verifier ==="

missing=$(node --input-type=module -e "
  try {
    const m = await import('@pikku/core/provider')
    if (!('defineProvider' in m)) console.log('@pikku/core/provider has no export defineProvider')
  } catch (e) {
    console.log('missing API: cannot import @pikku/core/provider (' + (e.code ?? e.message) + ')')
  }
" 2>&1)
if [ -n "$missing" ]; then fail "preflight: $missing"; else pass "preflight"; fi

for addon in ../providers/addons/prov-db ../providers/addons/prov-ai ../providers/addons/prov-hostile; do
  (cd "$addon" && npx pikku all >/dev/null 2>&1) || fail "addon $addon: pikku all failed"
done

rm -rf .pikku .deploy
if ! out=$(npx pikku all --approve-providers 2>&1); then
  fail "pikku all: $(tail -n 2 <<<"$out" | tr '\n' ' ')"
fi

plan() { # provider
  npx pikku deploy plan --provider "$1" --result-file ".deploy/$1/plan-result.json" 2>&1
}
bundles() { # provider
  find ".deploy/$1" -name bundle.js 2>/dev/null
}
has() { # provider marker  -> any bundle of the provider contains marker
  local b
  for b in $(bundles "$1"); do grep -qF "$2" "$b" && return 0; done
  return 1
}
bundle_for() { # provider route-or-function-name
  local b
  for b in $(bundles "$1"); do grep -qF "$2" "$b" && { echo "$b"; return; }; done
}
expect_marker() { # label provider marker present|absent [bundle]
  local label=$1 provider=$2 marker=$3 want=$4 file=$5
  local found=1
  if [ -n "$file" ]; then grep -qF "$marker" "$file" && found=0; else has "$provider" "$marker" && found=0; fi
  if [ "$want" = present ] && [ $found -eq 0 ]; then pass "$label: $marker present"
  elif [ "$want" = absent ] && [ $found -ne 0 ]; then pass "$label: $marker absent"
  else fail "$label: expected $marker $want"; fi
}

for provider in standalone cloudflare; do
  if ! out=$(plan "$provider"); then
    fail "deploy plan $provider: $(tail -n 3 <<<"$out" | tr '\n' ' ')"
  fi
done

echo "--- the db addon picks its variant by profile ---"
worker_db=$(bundle_for cloudflare usesDb)
expect_marker "worker db unit" cloudflare PIKKU_MARKER_SQLITE present "$worker_db"
expect_marker "worker db unit" cloudflare PIKKU_MARKER_PG absent "$worker_db"
expect_marker "container" cloudflare PIKKU_MARKER_PG present "$(find .deploy/cloudflare/container -name bundle.js 2>/dev/null | head -n 1)"

echo "--- a unit that reaches no kysely carries neither driver ---"
plain=.deploy/cloudflare/units/svc-base/bundle.js
expect_marker "plain unit" cloudflare PIKKU_MARKER_SQLITE absent "$plain"
expect_marker "plain unit" cloudflare PIKKU_MARKER_PG absent "$plain"

echo "--- only the listed ai SDK is bundled, in every bundle ---"
expect_marker "ai" cloudflare PIKKU_MARKER_OPENAI present "$(bundle_for cloudflare usesAi)"
expect_marker "ai" cloudflare PIKKU_MARKER_ANTHROPIC absent
expect_marker "ai" standalone PIKKU_MARKER_ANTHROPIC absent
expect_marker "plain unit" cloudflare PIKKU_MARKER_OPENAI absent "$plain"

echo "--- an unreached provider's module side effect is not bundled ---"
expect_marker "side effect" standalone __pikkuHit absent
expect_marker "side effect" cloudflare __pikkuHit absent

echo "--- standalone owns its database: a plain deploy variant cannot replace kysely ---"
cp src/addons.ts src/addons.ts.orig
cp src/http.wiring.ts src/http.wiring.ts.orig
cp pikku.config.json pikku.config.json.orig
trap 'mv -f pikku.config.json.orig pikku.config.json 2>/dev/null; mv -f src/addons.ts.orig src/addons.ts 2>/dev/null; mv -f src/http.wiring.ts.orig src/http.wiring.ts 2>/dev/null' EXIT
cat >>src/addons.ts <<'TS'

// prov-db has no deploy:standalone variant, so it is not run on standalone.
TS
if out=$(rm -rf .pikku && npx pikku all --approve-providers 2>&1 && plan standalone); then
  pass "standalone with no deploy:standalone variant builds"
else
  fail "standalone with no deploy:standalone variant: $(tail -n 2 <<<"$out" | tr '\n' ' ')"
fi

echo "--- the real @pikku/addon-kysely-* providers, one at a time ---"
# Each driver's own startup error text is unique to its provider module.
PG_TEXT='The postgres kysely service needs DATABASE_URL'
SQLITE_TEXT='The sqlite kysely service needs LIBSQL_URL'
real_addon() { # package
  cat >src/addons.ts <<TS
import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'db', package: '$1', providers: ['kysely'] })
wireAddon({ name: 'ai', package: '@verifier/prov-ai', providers: ['openai'] })
TS
}
# A project with a db section owns kysely under pikku dev, so a database addon replaces it only without one.
node -e "
  const fs = require('fs'); const c = JSON.parse(fs.readFileSync('pikku.config.json.orig', 'utf8')); delete c.db
  fs.writeFileSync('pikku.config.json', JSON.stringify(c, null, 2))"
for real in postgres sqlite; do
  if [ "$real" = postgres ]; then
    own=$PG_TEXT; other=$SQLITE_TEXT
    # postgres has no Worker variant, so no Worker unit may reach kysely.
    grep -v "route: '/db'" src/http.wiring.ts.orig >src/http.wiring.ts
  else
    own=$SQLITE_TEXT; other=$PG_TEXT
    cp src/http.wiring.ts.orig src/http.wiring.ts
  fi
  real_addon "@pikku/addon-kysely-$real"
  if ! out=$(rm -rf .pikku .deploy && npx pikku all --approve-providers 2>&1 && plan cloudflare && plan standalone); then
    fail "real $real: $(tail -n 3 <<<"$out" | tr '\n' ' ')"
    continue
  fi
  container=$(find .deploy/cloudflare/container -name bundle.js 2>/dev/null | head -n 1)
  expect_marker "real $real container" cloudflare "$own" present "$container"
  expect_marker "real $real container" cloudflare "$other" absent "$container"
  expect_marker "real $real" cloudflare "$other" absent
  # Standalone opens its own sqlite database, which can import the libSQL package, so only postgres is a clean witness there.
  expect_marker "real $real standalone (no deploy:standalone variant)" standalone "$PG_TEXT" absent
done
mv -f src/addons.ts.orig src/addons.ts
cp src/addons.ts src/addons.ts.orig
cp src/http.wiring.ts.orig src/http.wiring.ts
cp pikku.config.json.orig pikku.config.json

echo "=== $passed passed, ${#failures[@]} failed ==="
for f in "${failures[@]}"; do echo "  x $f"; done
if [ ${#failures[@]} -gt 0 ]; then exit 1; fi
echo "=== All tests passed ==="
