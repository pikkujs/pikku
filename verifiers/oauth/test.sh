#!/bin/bash
set -e

echo "=== OAuth2 CLI Test ==="

# Start mock OAuth server in background
echo "Starting mock OAuth2 server..."
npx tsx src/test-oauth.ts &
MOCK_PID=$!

# Wait for server to be ready
sleep 2

# Check if server is running
if ! curl -s http://localhost:8080/.well-known/openid-configuration > /dev/null; then
  echo "ERROR: Mock OAuth server failed to start"
  kill $MOCK_PID 2>/dev/null || true
  exit 1
fi
echo "Mock server running on port 8080"

# Set up test credentials
export MOCK_OAUTH_APP='{"clientId":"test-client","clientSecret":"test-secret"}'

# Run oauth:status to verify credential is found
echo ""
echo "=== Testing oauth:status ==="
yarn pikku oauth:status mock

# Run oauth:connect (mock server auto-approves)
echo ""
echo "=== Testing oauth:connect ==="
yarn pikku oauth:connect mock --url http://localhost:9877

# Clean up
echo ""
echo "=== Cleanup ==="
kill $MOCK_PID 2>/dev/null || true
echo "Mock server stopped"

echo ""
echo "=== All tests passed ==="
