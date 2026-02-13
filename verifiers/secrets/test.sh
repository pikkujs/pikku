#!/bin/bash
set -e

echo "=== Secrets Verifier Tests ==="

# Test 1: TypedSecretService type inference
echo ""
echo "=== Testing TypedSecretService ==="
npx tsx src/test-secrets.ts

echo ""
echo "=== All tests passed ==="
