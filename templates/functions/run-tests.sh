#!/bin/bash
set -e

# -------- DETECT PACKAGE MANAGER --------
# When invoked via yarn/bun/npm, they set npm_config_user_agent
# Examples:
#   yarn: "yarn/1.22.19 npm/? node/v18.0.0 darwin x64"
#   bun: "bun/1.0.0"
#   npm: "npm/9.0.0 node/v18.0.0 darwin x64"
if [[ "$npm_config_user_agent" == bun* ]] || [[ "$npm_execpath" == *bun* ]]; then
    PKG_MANAGER="bun"
elif [[ "$npm_config_user_agent" == yarn* ]] || [[ "$npm_execpath" == *yarn* ]]; then
    PKG_MANAGER="yarn"
elif [[ "$npm_config_user_agent" == npm* ]] || [[ "$npm_execpath" == *npm* ]]; then
    PKG_MANAGER="npm"
else
    # Default to yarn if we can't detect
    PKG_MANAGER="yarn"
fi

echo "Detected package manager: $PKG_MANAGER"

# -------- DEFAULTS --------
SERVER_CMD="$PKG_MANAGER run start"
BUILD_CMD=""
HELLO_WORLD_URL_PREFIX="http://localhost:4002"
RUN_HTTP_TESTS=false
RUN_WS_TESTS=false
RUN_RPC_TESTS=false
RUN_HTTP_SSE_TESTS=false
RUN_QUEUE_TESTS=false
RUN_MCP_TESTS=false
RUN_MCP_HTTP_TESTS=false
RUN_CLI_TESTS=false
RUN_WORKFLOW_TESTS=false
RUN_AGENT_TESTS=false
RUN_REALTIME_TESTS=false
RUN_FULLSTACK_TESTS=false
NO_DATABASE=false
IGNORE_SERVER_READY_CHECK=false
NO_START=false
WS_PATH=""

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
        --no-start)
            NO_START=true
            shift
            ;;
        --url)
            HELLO_WORLD_URL_PREFIX="$2"
            shift 2
            ;;
        --ws-path)
            WS_PATH="$2"
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
        --mcp-http)
            RUN_MCP_HTTP_TESTS=true
            shift
            ;;
        --cli)
            RUN_CLI_TESTS=true
            shift
            ;;
        --workflow)
            RUN_WORKFLOW_TESTS=true
            shift
            ;;
        --agent)
            RUN_AGENT_TESTS=true
            shift
            ;;
        --realtime)
            RUN_REALTIME_TESTS=true
            shift
            ;;
        --fullstack)
            RUN_FULLSTACK_TESTS=true
            shift
            ;;
        --no-database)
            NO_DATABASE=true
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
export TODO_APP_URL="$HELLO_WORLD_URL_PREFIX"
export WS_PATH

# Agent threads belong to the session principal, and a request with no session
# gets an owner minted fresh each time — so the agent clients need a session to
# reach a thread they created on an earlier turn. Minting the token here rather
# than committing one keeps the templates free of a working credential, and
# exporting it before the server starts is what puts it in both processes.
# The `demo-` prefix is load-bearing: LocalSecretService JSON-parses a secret
# before returning it, so an all-digit token would come back as a number and
# never match the string in the header.
export AGENT_DEMO_TOKEN="${AGENT_DEMO_TOKEN:-demo-$(openssl rand -hex 16 2>/dev/null || date +%s)}"

# Recursively terminate a process and all of its descendants. `kill $PID`
# alone only signals the direct child: yarn forwards SIGTERM to its spawned
# `tsx` server, but `bun run` does not, leaving the real server orphaned. An
# orphan inherits this step's stdout pipe and keeps it open, so CI hangs until
# the job times out. Walking the tree with `pgrep -P` (portable on macOS and
# Linux) guarantees the server is gone regardless of package manager.
kill_tree() {
    local pid="$1"
    local child
    for child in $(pgrep -P "$pid" 2>/dev/null); do
        kill_tree "$child"
    done
    kill "$pid" 2>/dev/null || true
}

# -------- START SERVER --------
# An app that declares no database still gets pointed at one by `pikku serve`,
# which takes DATABASE_URL from the environment over the app's own config. In
# CI that variable belongs to a Postgres these tests share with every other
# template, and the app has no migrations for it, so the server exits on a
# schema it was never asked to have. Templates that run without a database say
# so and the variable stops being ambient.
if $NO_DATABASE; then
    unset DATABASE_URL
fi

if $NO_START; then
    echo "Skipping server start (--no-start), assuming external server at $HELLO_WORLD_URL_PREFIX"
else
    echo "Starting server: $SERVER_CMD"
    bash -c "$SERVER_CMD" & SERVER_PID=$!
    trap "kill_tree $SERVER_PID" EXIT
fi

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
    $PKG_MANAGER run test:http-fetch
fi

# -------- RUN WEBSOCKET TESTS IF REQUESTED --------
if $RUN_WS_TESTS; then
    echo "Running WebSocket tests..."
    $PKG_MANAGER run test:websocket
fi

# -------- RUN RPC TESTS IF REQUESTED --------
if $RUN_RPC_TESTS; then
    echo "Running RPC tests..."
    $PKG_MANAGER run test:rpc
fi

# -------- RUN HTTP-SSE TESTS IF REQUESTED --------
if $RUN_HTTP_SSE_TESTS; then
    echo "Running HTTP-SSE tests..."
    $PKG_MANAGER run test:http-sse
fi

# -------- RUN QUEUE TESTS IF REQUESTED --------
if $RUN_QUEUE_TESTS; then
    echo "Running Queue tests..."
    $PKG_MANAGER run test:queue
fi

# -------- RUN MCP TESTS IF REQUESTED --------
if $RUN_MCP_TESTS; then
    echo "Running MCP tests..."
    $PKG_MANAGER run test:mcp
fi

# -------- RUN MCP HTTP TESTS IF REQUESTED --------
if $RUN_MCP_HTTP_TESTS; then
    echo "Running MCP HTTP tests..."
    $PKG_MANAGER run test:mcp:http
fi

# -------- RUN CLI TESTS IF REQUESTED --------
if $RUN_CLI_TESTS; then
    echo "Running CLI tests..."
    echo "Testing local CLI..."
    $PKG_MANAGER run test:cli:local
    echo "Testing raw remote CLI..."
    $PKG_MANAGER run test:cli:raw
fi

# -------- RUN WORKFLOWS TESTS IF REQUESTED --------
if $RUN_WORKFLOW_TESTS; then
    echo "Running Workflow tests..."
    $PKG_MANAGER run test:workflows
fi

# -------- RUN AGENT TESTS IF REQUESTED --------
if $RUN_AGENT_TESTS; then
    echo "Running Agent HTTP tests..."
    $PKG_MANAGER run test:agent-http
    echo "Running Agent SSE tests..."
    $PKG_MANAGER run test:agent-sse
fi

# -------- RUN REALTIME TESTS IF REQUESTED --------
if $RUN_REALTIME_TESTS; then
    echo "Running Realtime tests..."
    $PKG_MANAGER run test:realtime
fi

# -------- RUN FULLSTACK TESTS IF REQUESTED --------
if $RUN_FULLSTACK_TESTS; then
    # The browser pass goes first: the HTTP pass finishes by tripping the
    # lockout on purpose, and a throttled store cannot be opened from a form.
    echo "Running Browser tests..."
    npx playwright install chromium
    $PKG_MANAGER run test:browser

    echo "Running Fullstack tests..."
    $PKG_MANAGER run test:fullstack
fi

echo "✅ All tests completed successfully."
