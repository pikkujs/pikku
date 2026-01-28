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

# Test 2: OAuth2Client against mock server
echo ""
echo "=== Testing OAuth2Client ==="
npx tsx src/test-oauth2-client.ts

echo ""
echo "=== OAuth2 CLI Test ==="

# Set up test credentials
export MOCK_OAUTH_APP='{"clientId":"test-client","clientSecret":"test-secret"}'

# Run oauth:status
echo ""
echo "=== Testing oauth:status ==="
yarn pikku oauth:status mock

echo ""
echo "=== Testing oauth:connect ==="
CALLBACK_PORT=9877

# Start mock server only in local mode (it opens browser)
if [ "$CI_MODE" != "true" ]; then
  echo "Starting mock OAuth2 server..."
  npx tsx src/test-oauth.ts &
  MOCK_PID=$!
  sleep 2
fi

# Run oauth:connect in background
OUTPUT_FILE=$(mktemp)
yarn pikku oauth:connect mock --url http://localhost:$CALLBACK_PORT > "$OUTPUT_FILE" 2>&1 &
CONNECT_PID=$!
sleep 2

# In CI mode, simulate the callback with curl
if [ "$CI_MODE" = "true" ]; then
  # Extract state from output
  STATE=$(grep -o 'state=[^&"]*' "$OUTPUT_FILE" | head -1 | cut -d= -f2 || echo "test-state")
  echo "Simulating callback with state: $STATE"
  CALLBACK_RESPONSE=$(curl -s "http://localhost:$CALLBACK_PORT/oauth/callback?code=mock-code&state=$STATE")
  echo "$CALLBACK_RESPONSE"

  # Verify callback was successful
  if echo "$CALLBACK_RESPONSE" | grep -q "Authorization successful"; then
    echo "✓ Callback received successfully"
  else
    echo "✗ Callback failed"
    exit 1
  fi
fi

# Wait for oauth:connect (will fail on token exchange in CI, that's expected)
wait $CONNECT_PID || true
cat "$OUTPUT_FILE"
rm -f "$OUTPUT_FILE"

# Cleanup
if [ "$CI_MODE" != "true" ]; then
  kill $MOCK_PID 2>/dev/null || true
fi

echo ""
echo "=== All tests passed ==="
