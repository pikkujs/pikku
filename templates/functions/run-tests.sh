#!/bin/bash
set -e

# -------- DEFAULTS --------
SERVER_CMD="yarn run start"
BUILD_CMD=""
HELLO_WORLD_URL_PREFIX="http://localhost:4002"
RUN_WS_TESTS=false
RUN_RPC_TESTS=false
RUN_HTTP_SSE_TESTS=false
RUN_QUEUE_TESTS=false
RUN_MCP_TESTS=false
RUN_CLI_TESTS=false

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

# -------- START SERVER --------
echo "Starting server: $SERVER_CMD"
bash -c "$SERVER_CMD" & SERVER_PID=$!
trap "kill $SERVER_PID" EXIT

# -------- HTTP TEST (Health check is the test) --------
yarn run test:http-fetch

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
