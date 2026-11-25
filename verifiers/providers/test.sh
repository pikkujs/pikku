#!/bin/bash
# Providers verifier. Usage: ./test.sh [scenario ...]   (no arguments runs every scenario)
# Not part of test:verifiers: run it by hand with `bash verifiers/providers/test.sh`.
cd "$(dirname "$0")"

failures=()
passed=0
LOCK_FIXTURE=pikku-addons.lock.fixture

all_scenarios=(
  provides-nothing optional-absent default-initializer optional-cascade-bad optional-cascade
  typed function-needs function-needs-ghost no-variant dup protected-no-replaces
  protected-addon lock-hostile-replace collection-key-conflict optional-bad-array
  collections-zero collections wire wire-lifetime wire-shadow wire-core-key runtime addon-cross
  lock-new lock-drift lock-frozen providers-only unknown-provider remote-providers remote-local
)

fail() { # scenario, message
  echo "x $1: $2"
  failures+=("$1: $2")
}

pass() { # scenario, message
  echo "ok $1: $2"
  passed=$((passed + 1))
}

# The API every scenario is written against. Without it the scenarios cannot mean anything,
# so a missing export is reported once, by name, before any scenario runs.
preflight() {
  local missing
  missing=$(node --input-type=module -e "
    try {
      const m = await import('@pikku/core/provider')
      const want = ['defineProvider', 'defineWireProvider', 'defineProviderCollection', 'ProviderRegistry', 'runProviders', 'ProviderError']
      const absent = want.filter((n) => !(n in m))
      if (absent.length) console.log('@pikku/core/provider has no export ' + absent.join(', '))
    } catch (e) {
      console.log('missing API: cannot import @pikku/core/provider (' + (e.code ?? e.message) + ')')
    }
  " 2>&1)
  if [ -n "$missing" ]; then
    fail preflight "$missing"
  else
    pass preflight "@pikku/core/provider exports the provider API"
  fi
}

build_addons() {
  for addon in prov-db prov-ai prov-sinks prov-hostile prov-wire; do
    if ! out=$(cd "addons/$addon" && npx pikku all 2>&1); then
      fail "addon:$addon" "pikku all failed: $(tail -n 3 <<<"$out" | tr '\n' ' ')"
    fi
  done
}

pikku_all() { # scenario, extra args...
  local scenario=$1
  shift
  rm -rf "scenarios/$scenario/.pikku"
  (cd "scenarios/$scenario" && npx pikku all "$@" 2>&1)
}

deploy_plan() { # scenario, provider
  rm -rf "scenarios/$1/.pikku" "scenarios/$1/.deploy"
  (cd "scenarios/$1" && npx pikku all >/dev/null 2>&1 && npx pikku deploy plan --provider "$2" --result-file .deploy/plan-result.json 2>&1)
}

# expect_failure <scenario> <PKU code> <message substring> [command...]
expect_failure() {
  local scenario=$1 code=$2 text=$3 output
  shift 3
  if [ $# -gt 0 ]; then
    output=$("$@") && { fail "$scenario" "succeeded, expected $code"; return; }
  else
    output=$(pikku_all "$scenario") && { fail "$scenario" "pikku all succeeded, expected $code"; return; }
  fi
  if ! grep -qF "$code" <<<"$output"; then
    fail "$scenario" "failed without $code: $(tail -n 2 <<<"$output" | tr '\n' ' ')"
    return
  fi
  if ! grep -qF "$text" <<<"$output"; then
    fail "$scenario" "$code raised without: $text"
    return
  fi
  pass "$scenario" "$code $text"
}

# expect_ok <scenario> [command...]
expect_ok() {
  local scenario=$1 output
  shift
  if [ $# -gt 0 ]; then
    output=$("$@") || { fail "$scenario" "failed: $(tail -n 3 <<<"$output" | tr '\n' ' ')"; return; }
  else
    output=$(pikku_all "$scenario") || { fail "$scenario" "pikku all failed: $(tail -n 3 <<<"$output" | tr '\n' ' ')"; return; }
  fi
  if ! output=$(cd "scenarios/$scenario" && npx tsc --noEmit -p . 2>&1); then
    fail "$scenario" "tsc failed: $(head -n 3 <<<"$output" | tr '\n' ' ')"
    return
  fi
  pass "$scenario" "builds and typechecks"
}

reset_lock() { # scenario
  rm -f "scenarios/$1/pikku-addons.lock"
  if [ -f "scenarios/$1/$LOCK_FIXTURE" ]; then
    cp "scenarios/$1/$LOCK_FIXTURE" "scenarios/$1/pikku-addons.lock"
  fi
}

hostile_src=addons/prov-hostile/src/providers.ts
drift_edit() {
  cp "$hostile_src" "$hostile_src.orig"
  perl -0pi -e "s/(export const pinoLogger = defineProvider\(\{\n  replaces: \['logger'\],\n  common: )\(\)/\$1({ kysely })/" "$hostile_src"
  (cd addons/prov-hostile && npx pikku all >/dev/null 2>&1)
}
drift_restore() {
  if [ -f "$hostile_src.orig" ]; then
    mv -f "$hostile_src.orig" "$hostile_src"
    (cd addons/prov-hostile && npx pikku all >/dev/null 2>&1)
  fi
}
trap drift_restore EXIT

run_scenario() {
  local s=$1
  reset_lock "$s"
  case "$s" in
    provides-nothing) expect_failure "$s" PKU380 "provides no key and adds to no collection" ;;
    optional-absent) expect_ok "$s" ;;
    default-initializer) expect_failure "$s" PKU386 "List it in optional" ;;
    optional-cascade-bad) expect_failure "$s" PKU391 "provides only sometimes" ;;
    optional-cascade) expect_ok "$s" ;;
    typed)
      expect_ok "$s"
      if out=$(cd "scenarios/$s" && npx tsc --noEmit -p tsconfig.type-tests.json 2>&1); then
        pass "$s" "type tests"
      else
        fail "$s" "type tests: $(head -n 3 <<<"$out" | tr '\n' ' ')"
      fi
      ;;
    function-needs) expect_ok "$s" ;;
    function-needs-ghost) expect_failure "$s" PKU390 "needs 'ghost'" ;;
    no-variant)
      expect_failure "$s" PKU388 "looked for deploy:standalone, deploy, common" deploy_plan "$s" standalone
      ;;
    dup) expect_failure "$s" PKU385 "shared" ;;
    protected-no-replaces) expect_failure "$s" PKU394 "replaces: ['logger']" ;;
    protected-addon) expect_ok "$s" pikku_all "$s" --approve-providers ;;
    lock-hostile-replace) expect_failure "$s" PKU395 "+ replaces secrets" ;;
    collection-key-conflict) expect_failure "$s" PKU398 "cannot also provide it as a key" ;;
    optional-bad-array) expect_failure "$s" PKU378 "array of string literals" ;;
    collections-zero | collections) expect_ok "$s" ;;
    wire) expect_ok "$s" ;;
    wire-lifetime) expect_failure "$s" PKU392 "builds per request" ;;
    wire-shadow) expect_failure "$s" PKU393 "A key has one lifetime" ;;
    wire-core-key) expect_failure "$s" PKU399 "core builds for every invocation" ;;
    runtime)
      expect_ok "$s"
      if out=$(cd "scenarios/$s" && npx tsx src/check-runtime.ts 2>&1); then
        pass "$s" "runtime enforcement"
      else
        fail "$s" "runtime enforcement: $(tail -n 3 <<<"$out" | tr '\n' ' ')"
      fi
      ;;
    addon-cross) expect_ok "$s" pikku_all "$s" --approve-providers ;;
    lock-new)
      if out=$(pikku_all "$s") && grep -qF "recorded addon provider 'hostile/pinoLogger'" <<<"$out" \
        && grep -qF '"providers"' "scenarios/$s/pikku-addons.lock"; then
        pass "$s" "first build records the provider in the lock"
      else
        fail "$s" "first build did not record hostile/pinoLogger in pikku-addons.lock"
      fi
      ;;
    lock-drift)
      pikku_all "$s" >/dev/null 2>&1 || true
      drift_edit
      before=${#failures[@]}
      expect_failure "$s" PKU395 "+ imports kysely"
      if [ ${#failures[@]} -eq "$before" ]; then
        if out=$(pikku_all "$s" --approve-providers); then
          pass "$s" "--approve-providers accepts the drift"
        else
          fail "$s" "--approve-providers did not accept the drift: $(tail -n 2 <<<"$out" | tr '\n' ' ')"
        fi
      fi
      drift_restore
      ;;
    lock-frozen)
      expect_failure "$s" PKU396 "is new" pikku_all "$s" --frozen
      ;;
    providers-only) expect_ok "$s" pikku_all "$s" --approve-providers ;;
    unknown-provider) expect_failure "$s" PKU374 "pinoLogger" ;;
    remote-providers) expect_failure "$s" PKU381 "takes no providers" ;;
    remote-local)
      expect_ok "$s" pikku_all "$s" --approve-providers
      if grep -qF '"remote/pinoLogger"' "scenarios/$s/pikku-addons.lock" 2>/dev/null; then
        pass "$s" "local package providers are recorded"
      else
        fail "$s" "local: { providers } did not record remote/pinoLogger in pikku-addons.lock"
      fi
      ;;
    *)
      fail "$s" "unknown scenario"
      ;;
  esac
}

echo "=== Providers Verifier ==="
preflight
build_addons

if [ $# -gt 0 ]; then
  selected=("$@")
else
  selected=("${all_scenarios[@]}")
fi
for s in "${selected[@]}"; do
  run_scenario "$s"
done

echo "=== $passed passed, ${#failures[@]} failed ==="
if [ ${#failures[@]} -gt 0 ]; then
  exit 1
fi
echo "=== All tests passed ==="
