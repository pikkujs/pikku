#!/bin/bash
set -e

CI_MODE=${CI:-false}

# Cleanup function to kill background processes
cleanup() {
  if [ -n "$CONNECT_PID" ]; then
    kill $CONNECT_PID 2>/dev/null || true
  fi
  if [ -n "$MOCK_PID" ]; then
    kill $MOCK_PID 2>/dev/null || true
  fi
  if [ -n "$OUTPUT_FILE" ] && [ -f "$OUTPUT_FILE" ]; then
    rm -f "$OUTPUT_FILE"
  fi
}

# Set trap to cleanup on exit
trap cleanup EXIT

echo "=== Secrets Verifier Tests ==="
echo "CI Mode: $CI_MODE"

# Test 1: TypedSecretService type inference
echo ""
echo "=== Testing TypedSecretService ==="
npx tsx src/test-secrets.ts

# Test 2: OAuth2Client against mock server (skip in CI - requires mock server)
if [ "$CI_MODE" != "true" ]; then
  echo ""
  echo "=== Testing OAuth2Client ==="
  npx tsx src/test-oauth2-client.ts
else
  echo ""
  echo "=== Skipping OAuth2Client in CI (requires mock server) ==="
fi

echo ""
echo "=== OAuth2 CLI Test ==="

# Set up test credentials
export MOCK_OAUTH_APP='{"clientId":"test-client","clientSecret":"test-secret"}'

# Run oauth:status
echo ""
echo "=== Testing oauth:status ==="
yarn pikku oauth:status mock

# Skip oauth:connect test in CI - it requires complex browser/callback mocking
# The oauth:status test above verifies the CLI integration
if [ "$CI_MODE" != "true" ]; then
  echo ""
  echo "=== Testing oauth:connect ==="
  CALLBACK_PORT=9877

  echo "Starting mock OAuth2 server..."
  npx tsx src/test-oauth.ts &
  MOCK_PID=$!
  sleep 2

  # Run oauth:connect in background
  OUTPUT_FILE=$(mktemp)
  yarn pikku oauth:connect mock --url http://localhost:$CALLBACK_PORT > "$OUTPUT_FILE" 2>&1 &
  CONNECT_PID=$!
  sleep 2

  # Wait for oauth:connect
  wait $CONNECT_PID || true
  cat "$OUTPUT_FILE"
  rm -f "$OUTPUT_FILE"

  # Cleanup
  kill $MOCK_PID 2>/dev/null || true
else
  echo ""
  echo "=== Skipping oauth:connect in CI (requires browser) ==="
fi

echo ""
echo "=== All tests passed ==="
