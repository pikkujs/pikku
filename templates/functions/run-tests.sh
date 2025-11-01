#!/bin/bash
set -e

# -------- DEFAULTS --------
SERVER_CMD="yarn run start"
BUILD_CMD=""
HELLO_WORLD_URL_PREFIX="http://localhost:4002"
RUN_HTTP_TESTS=false
RUN_WS_TESTS=false
RUN_RPC_TESTS=false
RUN_HTTP_SSE_TESTS=false
RUN_QUEUE_TESTS=false
RUN_MCP_TESTS=false
RUN_CLI_TESTS=false
IGNORE_SERVER_READY_CHECK=false

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
        --ignore-server-ready-check)
            IGNORE_SERVER_READY_CHECK=true
            shift
            ;;
        --url)
            HELLO_WORLD_URL_PREFIX="$2"
            shift 2
            ;;
        --http)
            RUN_HTTP_TESTS=true
            shift
            ;;
        --websocket)
            RUN_WS_TESTS=true
            shift
            ;;
        --rpc)
            RUN_RPC_TESTS=true
            shift
            ;;
        --http-sse)
            RUN_HTTP_SSE_TESTS=true
            shift
            ;;
        --queue)
            RUN_QUEUE_TESTS=true
            shift
            ;;
        --mcp)
            RUN_MCP_TESTS=true
            shift
            ;;
        --cli)
            RUN_CLI_TESTS=true
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

# -------- EXPORT URL FOR TEST SCRIPTS --------
export HELLO_WORLD_URL_PREFIX

# -------- START SERVER --------
echo "Starting server: $SERVER_CMD"
bash -c "$SERVER_CMD" & SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

# -------- WAIT FOR SERVER TO BE READY --------
if $IGNORE_SERVER_READY_CHECK; then
    echo "Ignoring server ready check as per flag."
    sleep 2  # Give a brief moment for the server to start
else
    echo "Waiting for server to be ready..."
    SERVER_READY=false
    for i in {1..30}; do
        # Extract host and port from HELLO_WORLD_URL_PREFIX
        SERVER_HOST=$(echo "$HELLO_WORLD_URL_PREFIX" | sed -e 's|http://||' -e 's|/.*||' -e 's|:.*||')
        SERVER_PORT=$(echo "$HELLO_WORLD_URL_PREFIX" | sed -e 's|.*:||' -e 's|/.*||')

        # Try to connect to the server
        if nc -z "$SERVER_HOST" "$SERVER_PORT" 2>/dev/null; then
            echo "✅ Server is ready on $HELLO_WORLD_URL_PREFIX"
            SERVER_READY=true
            break
        fi

        if [ $i -eq 30 ]; then
            echo "❌ Server failed to start within 30 seconds"
            exit 1
        fi

        sleep 1
    done
fi

if [ "$SERVER_READY" = false ]; then
  echo "❌ Server never became ready"
  exit 1
fi

# -------- RUN HTTP TESTS IF REQUESTED --------
if $RUN_HTTP_TESTS; then
    echo "Running HTTP tests..."
    yarn run test:http-fetch
fi

# -------- RUN WEBSOCKET TESTS IF REQUESTED --------
if $RUN_WS_TESTS; then
    echo "Running WebSocket tests..."
    yarn run test:websocket
fi

# -------- RUN RPC TESTS IF REQUESTED --------
if $RUN_RPC_TESTS; then
    echo "Running RPC tests..."
    yarn run test:rpc
fi

# -------- RUN HTTP-SSE TESTS IF REQUESTED --------
if $RUN_HTTP_SSE_TESTS; then
    echo "Running HTTP-SSE tests..."
    yarn run test:http-sse
fi

# -------- RUN QUEUE TESTS IF REQUESTED --------
if $RUN_QUEUE_TESTS; then
    echo "Running Queue tests..."
    yarn run test:queue
fi

# -------- RUN MCP TESTS IF REQUESTED --------
if $RUN_MCP_TESTS; then
    echo "Running MCP tests..."
    yarn run test:mcp
fi

# -------- RUN CLI TESTS IF REQUESTED --------
if $RUN_CLI_TESTS; then
    echo "Running CLI tests..."
    echo "Testing local CLI..."
    yarn run test:cli:local
    echo "Testing remote CLI..."
    yarn run test:cli:remote
fi

echo "✅ All tests completed successfully."
