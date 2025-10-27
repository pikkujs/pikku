#!/usr/bin/env bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting BullMQ queue worker test...${NC}"

# Trap to ensure cleanup happens even if script fails
cleanup() {
  if [ ! -z "$SERVER_PID" ]; then
    echo -e "\n${YELLOW}Cleaning up: Stopping server (PID: $SERVER_PID)...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

# Start the server in the background
echo -e "${YELLOW}Starting queue worker server...${NC}"
npx tsx src/start.ts &
SERVER_PID=$!

echo -e "${GREEN}Server started with PID: $SERVER_PID${NC}"

# Wait for server to initialize
echo -e "${YELLOW}Waiting for server to initialize...${NC}"
sleep 3

# Check if server is still running
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo -e "${RED}Server failed to start!${NC}"
  exit 1
fi

# Run the client test
echo -e "${YELLOW}Running queue worker client test...${NC}"
if npx tsx client/queue-worker.ts; then
  echo -e "${GREEN}✓ Test passed!${NC}"
  TEST_EXIT_CODE=0
else
  echo -e "${RED}✗ Test failed!${NC}"
  TEST_EXIT_CODE=1
fi

# Wait a bit for jobs to complete
sleep 6

# Cleanup will be handled by trap
exit $TEST_EXIT_CODE
