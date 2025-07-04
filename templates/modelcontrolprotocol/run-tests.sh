#!/bin/bash
set -e

echo "🧪 Running Pikku MCP Template Tests"

# Run TypeScript compilation check
echo "📝 Checking TypeScript compilation..."
npx tsc --noEmit

# Generate Pikku files
echo "⚙️ Generating Pikku files..."
npx pikku all

# Check that MCP files were generated
echo "🔍 Verifying generated MCP files..."
if [ ! -f ".pikku/mcp/mcp.gen.json" ]; then
    echo "❌ Error: MCP JSON file not generated"
    exit 1
fi

if [ ! -f ".pikku/mcp/pikku-mcp-bootstrap.gen.ts" ]; then
    echo "❌ Error: MCP bootstrap file not generated"
    exit 1
fi

# Build the project
echo "🔨 Building project..."
npx tsc

# Verify the server can be imported without errors
echo "🚀 Testing server startup..."
timeout 5s node dist/mcp-server.js || {
    exit_code=$?
    if [ $exit_code -eq 124 ]; then
        echo "✅ Server started successfully (timed out as expected)"
    else
        echo "❌ Server failed to start"
        exit 1
    fi
}

echo "✅ All tests passed!"