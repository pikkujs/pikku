#!/bin/bash
set -e

echo "=== Variables Verifier Tests ==="

echo ""
echo "=== Testing declared defaults ==="
npx tsx src/test-variable-defaults.ts

echo ""
echo "=== Testing a project without credentials bootstraps none ==="
npx tsx src/test-credentials-not-bootstrapped.ts

echo ""
echo "=== All tests passed ==="
