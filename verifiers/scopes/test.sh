#!/bin/bash
set -e

echo "=== Scopes Verifier Tests ==="
echo ""
npx tsx src/test-scopes.ts
echo ""
echo "=== All tests passed ==="
