#!/bin/bash
set -e

echo "=== Dev Platform Services Verifier ==="
echo "--- a project that declares and opts in to nothing generates no services file ---"
rm -rf .pikku
npx pikku
if [ -e .pikku/providers/pikku-dev-providers.gen.ts ]; then
  echo "✗ a services file was generated for a project that declares no service"
  exit 1
fi
npx tsc -b
echo "✓ no services, no generated file"
echo "--- opted-in services: dev and deploy variants across addons ---"
for addon in svc-notify svc-select svc-bad; do
  (cd "$addon" && npx pikku all >/dev/null)
  test -f "$addon/.pikku/addon/providers/pikku-providers-meta.gen.json"
done
for scenario in multi pg sqlite lifecycle; do
  rm -rf "scenarios/$scenario/.pikku"
  (cd "scenarios/$scenario" && npx pikku all >/dev/null)
  test -f "scenarios/$scenario/.pikku/providers/pikku-dev-providers.gen.ts"
done
(cd scenarios/multi && npx tsc --noEmit -p .)
echo "--- wireAddon service names are typed from the addon's meta ---"
(cd scenarios/multi && npx tsc --noEmit -p tsconfig.type-tests.json)
echo "✓ a declared name typechecks, an undeclared one is a compile error"
npx tsx src/check-services.ts

echo "--- wireRemoteAddon: one name carries the contract and a local package's services ---"
rm -rf scenarios/remote-local/.pikku
(cd scenarios/remote-local && npx pikku all >/dev/null)
npx tsx src/check-remote-local.ts

echo "--- #pikku/provider: typed services for a project, erased at runtime ---"
rm -rf scenarios/typed/.pikku
(cd scenarios/typed && npx pikku all >/dev/null)
(cd scenarios/typed && npx tsc --noEmit -p tsconfig.type-tests.json)
echo "✓ services are the project's SingletonServices plus what services provide, not any"
npx tsx src/check-typed-service.ts

echo "--- real pikku dev / pikku serve processes: service hooks around the app lifecycle ---"
(cd scenarios/lifecycle && npx tsc --noEmit -p .)
npx tsx src/check-lifecycle.ts

echo "--- the generated file is removed once no services remain ---"
(cd scenarios/multi && npx pikku all -c "$PWD/pikku.off.config.json" >/dev/null)
if [ -e scenarios/multi/.pikku/providers/pikku-dev-providers.gen.ts ]; then
  echo "✗ a stale pikku-dev-providers.gen.ts survived"
  exit 1
fi
echo "✓ stale generated file removed"

expect_failure() { # scenario, message
  rm -rf "scenarios/$1/.pikku"
  if output=$(cd "scenarios/$1" && npx pikku all 2>&1); then
    echo "✗ codegen succeeded for '$1'"
    exit 1
  fi
  if ! grep -qF "$2" <<<"$output"; then
    echo "$output"
    echo "✗ '$1' failed without: $2"
    exit 1
  fi
  echo "✓ $1: $2"
}
expect_failure dup "Providers 'bad/dupA' and 'bad/dupB' both provide 'shared' on pikku dev"
expect_failure ghost "Provider 'bad/needsGhost' needs 'ghost' on pikku dev, which nothing provides"
expect_failure cycle "Providers depend on each other in a cycle on pikku dev: bad/cycle"
echo "--- removed contributor config is refused, not silently dropped ---"
for section in dev deploy; do
  node -e '
    const fs = require("fs")
    const c = JSON.parse(fs.readFileSync("scenarios/multi/pikku.config.json", "utf8"))
    c[process.argv[1]] = { ...(c[process.argv[1]] ?? {}), contributors: ["./x.ts"] }
    fs.writeFileSync("scenarios/multi/pikku.removed.config.json", JSON.stringify(c))
  ' "$section"
  if output=$(cd scenarios/multi && npx pikku all -c "$PWD/pikku.removed.config.json" 2>&1); then
    rm -f scenarios/multi/pikku.removed.config.json
    echo "✗ codegen accepted $section.contributors"
    exit 1
  fi
  rm -f scenarios/multi/pikku.removed.config.json
  if ! grep -q "$section.contributors is no longer read" <<<"$output" || ! grep -q "docs/MIGRATION.md" <<<"$output"; then
    echo "$output"
    echo "✗ $section.contributors was refused without saying how to migrate"
    exit 1
  fi
  echo "✓ $section.contributors refused by name"
done
echo "--- an opted-in name the addon does not declare is a PKU374 error ---"
addons="scenarios/multi/src/addons.ts"
cp "$addons" "$addons.orig"
restore_addons() { mv -f "$addons.orig" "$addons" 2>/dev/null || true; }
trap restore_addons EXIT
cat >"$addons" <<'TS'
import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'select',
  package: '@verifier/svc-select',
  providers: ['store-mysql'],
})
TS
rm -rf scenarios/multi/.pikku
if output=$(cd scenarios/multi && npx pikku all 2>&1); then
  restore_addons
  echo "✗ codegen accepted a service the addon does not declare"
  exit 1
fi
restore_addons
if ! grep -q "PKU374" <<<"$output" || ! grep -q "edgeQueue" <<<"$output"; then
  echo "$output"
  echo "✗ an unknown service was refused without PKU374 listing the names"
  exit 1
fi
echo "✓ unknown service name: PKU374"
rm -rf scenarios/multi/.pikku
(cd scenarios/multi && npx pikku all >/dev/null)
echo "=== All tests passed ==="
