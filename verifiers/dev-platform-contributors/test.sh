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
echo "=== All tests passed ==="
