#!/bin/bash
set -e

echo "=== Secrets Verifier Tests ==="

# Test 1: TypedSecretService type inference
echo ""
echo "=== Testing TypedSecretService ==="
npx tsx src/test-secrets.ts

# Test 2: TypedCredentialService type inference
echo ""
echo "=== Testing TypedCredentialService ==="
npx tsx src/test-credentials.ts

# Test 3: the secretless boundary
echo ""
echo "=== Testing the secretless boundary ==="
npx tsx src/test-secretless.ts

# Test 4: a vault secret cannot reach a sink
echo ""
echo "=== Testing SecretValue at the sinks ==="
npx tsx src/test-secret-value.ts

echo ""
echo "=== All tests passed ==="
