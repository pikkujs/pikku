#!/bin/bash
set -e

echo "=== Feature Flags Verifier Tests ==="
echo ""
npx tsx src/test-flags.ts
echo ""
echo "=== All tests passed ==="
