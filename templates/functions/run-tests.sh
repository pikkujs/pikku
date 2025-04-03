#!/bin/bash
set -e

# -------- DEFAULTS --------
SERVER_CMD="npm run start"
BUILD_CMD=""
HELLO_WORLD_URL_PREFIX="http://localhost:4002"
RUN_WS_TESTS=false

# -------- ARGUMENT PARSING --------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)
            BUILD_CMD="$2"
            shift 2
            ;;
        --server)
            SERVER_CMD="$2"
            shift 2
            ;;
        --url)
            HELLO_WORLD_URL_PREFIX="$2"
            shift 2
            ;;
        --websocket)
            RUN_WS_TESTS=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# -------- RUN BUILD IF PROVIDED --------
if [ -n "$BUILD_CMD" ]; then
    echo "Running build: $BUILD_CMD"
    bash -c "$BUILD_CMD"
fi

# -------- START SERVER --------
echo "Starting server: $SERVER_CMD"
bash -c "$SERVER_CMD" & SERVER_PID=$!
trap "kill $SERVER_PID" EXIT

# -------- HTTP TEST (Health check is the test) --------
TIMEOUT=30
START_TIME=$(date +%s)

echo "Running HTTP test via health check at: $HELLO_WORLD_URL_PREFIX/hello-world"

while true; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$HELLO_WORLD_URL_PREFIX/hello-world" || echo "000")

    if [ "$RESPONSE" -eq 200 ]; then
        echo "✅ HTTP test passed with 200 OK"
        break
    fi

    CURRENT_TIME=$(date +%s)
    ELAPSED_TIME=$((CURRENT_TIME - START_TIME))

    if [ "$ELAPSED_TIME" -ge "$TIMEOUT" ]; then
        echo "❌ HTTP test failed after $TIMEOUT seconds (last status: $RESPONSE)"
        exit 1
    fi

    echo "Still failing (status $RESPONSE), retrying..."
    sleep 2
done

# -------- RUN WEBSOCKET TESTS IF REQUESTED --------
if $RUN_WS_TESTS; then
    echo "Running WebSocket tests..."
    # bash run-ws-tests.sh
fi

echo "✅ All tests completed successfully."
