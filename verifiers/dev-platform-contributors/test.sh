#!/bin/bash
set -e

echo "=== Dev Platform Contributors Verifier ==="
npx pikku
test -f .pikku/pikku-dev-platform-services.gen.ts
npx tsc -b
npx tsx src/check-dev-platform-services.ts

echo "--- a contributor need nothing meets fails codegen ---"
rm -rf .pikku-missing-need
if output=$(npx pikku all -c "$PWD/pikku.missing-need.config.json" 2>&1); then
  echo "✗ codegen succeeded although 'needs-kysely' needs kysely and nothing provides it"
  exit 1
fi
rm -rf .pikku-missing-need
if ! grep -q "Contributor 'needs-kysely' needs 'kysely', which nothing provides" <<<"$output"; then
  echo "$output"
  echo "✗ codegen failed without naming the unmet need"
  exit 1
fi
echo "✓ an unmet need fails codegen and names the contributor"
echo "--- opted-in contributors: dev and deploy variants across addons ---"
for addon in contrib-notify contrib-select contrib-bad; do
  (cd "$addon" && npx pikku all >/dev/null)
  test -f "$addon/.pikku/addon/contributors/pikku-contributors-meta.gen.json"
done
for scenario in multi pg sqlite; do
  rm -rf "scenarios/$scenario/.pikku"
  (cd "scenarios/$scenario" && npx pikku all >/dev/null)
  test -f "scenarios/$scenario/.pikku/contributors/pikku-dev-contributors.gen.ts"
done
(cd scenarios/multi && npx tsc --noEmit -p .)
npx tsx src/check-contributors.ts

echo "--- the generated file is removed once no contributors remain ---"
(cd scenarios/multi && npx pikku all -c "$PWD/pikku.off.config.json" >/dev/null)
if [ -e scenarios/multi/.pikku/contributors/pikku-dev-contributors.gen.ts ]; then
  echo "✗ a stale pikku-dev-contributors.gen.ts survived"
  exit 1
fi
echo "✓ stale generated file removed"

expect_failure() { # scenario, message
  rm -rf "scenarios/$1/.pikku"
  if output=$(cd "scenarios/$1" && npx pikku all 2>&1); then
    echo "✗ codegen succeeded for '$1'"
    exit 1
  fi
  if ! grep -q "$2" <<<"$output"; then
    echo "$output"
    echo "✗ '$1' failed without: $2"
    exit 1
  fi
  echo "✓ $1: $2"
}
expect_failure dup "Contributors 'dup-a' and 'dup-b' both provide 'shared'"
expect_failure ghost "Contributor 'needs-ghost' needs 'ghost', which nothing provides"
expect_failure cycle "depend on each other in a cycle: cycle-a -> cycle-b -> cycle-a"
echo "=== All tests passed ==="
