#!/bin/bash
set -e

echo "=== Variables Verifier Tests ==="

echo ""
echo "=== Testing declared defaults ==="
npx tsx src/test-variable-defaults.ts

echo ""
echo "=== All tests passed ==="
