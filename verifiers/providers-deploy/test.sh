#!/bin/bash
# One project built for standalone, cloudflare-worker and cloudflare-container, with bundle greps.
# Not part of test:verifiers: run it by hand with `bash verifiers/providers-deploy/test.sh`.
cd "$(dirname "$0")"

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
plain=$(bundle_for cloudflare plain)
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
trap 'mv -f src/addons.ts.orig src/addons.ts 2>/dev/null' EXIT
cat >>src/addons.ts <<'TS'

// prov-db has no deploy:standalone variant, so it is not run on standalone.
TS
if out=$(rm -rf .pikku && npx pikku all --approve-providers 2>&1 && plan standalone); then
  pass "standalone with no deploy:standalone variant builds"
else
  fail "standalone with no deploy:standalone variant: $(tail -n 2 <<<"$out" | tr '\n' ' ')"
fi

echo "=== $passed passed, ${#failures[@]} failed ==="
for f in "${failures[@]}"; do echo "  x $f"; done
if [ ${#failures[@]} -gt 0 ]; then exit 1; fi
echo "=== All tests passed ==="
