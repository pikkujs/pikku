#!/bin/bash
set -e

echo "=== Dev Platform Services Verifier ==="
echo "--- the verifier project generates and typechecks ---"
rm -rf .pikku
npx pikku
npx tsc -b

echo "--- real pikku dev / pikku serve processes with a host's platform services ---"
rm -rf scenarios/lifecycle/.pikku
(cd scenarios/lifecycle && npx pikku all >/dev/null)
(cd scenarios/lifecycle && npx tsc --noEmit -p .)
npx tsx src/check-lifecycle.ts

echo "--- removed contributor config is refused, not silently dropped ---"
config="scenarios/lifecycle/pikku.removed.config.json"
trap 'rm -f "$config"' EXIT
for section in dev deploy; do
  node -e '
    const fs = require("fs")
    const c = JSON.parse(fs.readFileSync("scenarios/lifecycle/pikku.config.json", "utf8"))
    c[process.argv[1]] = { ...(c[process.argv[1]] ?? {}), contributors: ["./x.ts"] }
    fs.writeFileSync(process.argv[2], JSON.stringify(c))
  ' "$section" "$config"
  if output=$(cd scenarios/lifecycle && npx pikku all -c "$PWD/pikku.removed.config.json" 2>&1); then
    echo "✗ codegen accepted $section.contributors"
    exit 1
  fi
  if ! grep -q "$section.contributors is no longer read" <<<"$output" || ! grep -q "docs/MIGRATION.md" <<<"$output"; then
    echo "$output"
    echo "✗ $section.contributors was refused without saying how to migrate"
    exit 1
  fi
  echo "✓ $section.contributors refused by name"
done
echo "=== All tests passed ==="
