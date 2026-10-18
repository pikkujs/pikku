#!/bin/bash
set -e

echo "=== Dev Platform Contributors Verifier ==="
mkdir -p node_modules/@verifier
ln -sfn ../../host-mail node_modules/@verifier/host-mail
npx pikku
test -f .pikku/pikku-dev-platform-services.gen.ts
npx tsc -b
npx tsx src/check-dev-platform-services.ts
echo "=== All tests passed ==="
