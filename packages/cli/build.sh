#!/bin/bash
set -euo pipefail

echo "Starting Pikku CLI build process..."

# Clean .pikku directory and dist
test -f package.json || { echo "Refusing to run outside package root"; exit 1; }
rm -rf -- .pikku dist

# Bootstrap using the published CLI - generates all .pikku files
echo "Bootstrapping with published @pikku/cli..."
: "${PIKKU_CLI_VERSION:=latest}"
npx -y "@pikku/cli@${PIKKU_CLI_VERSION}"

# Build TypeScript (may fail if published CLI generates stale types)
echo "Building TypeScript to dist..."
tsc -b || true

# Patch stale wireMCPTool import in compiled output (removed in current version)
if [ -f dist/.pikku/mcp/pikku-mcp-types.gen.js ]; then
  tmp=$(mktemp)
  sed -e 's/wireMCPTool as wireMCPToolCore, //g' \
      -e 's/wireMCPToolCore(mcpTool);//g' \
      dist/.pikku/mcp/pikku-mcp-types.gen.js > "$tmp" && mv "$tmp" dist/.pikku/mcp/pikku-mcp-types.gen.js
fi

# Rebuild Pikku using the local CLI and recompile
yarn pikku

# Patch stale startWorkflow calls in generated scaffold (data arg needs cast with new TypedStartWorkflow)
for f in src/scaffold/workflow-routes.gen.ts; do
  [ -f "$f" ] || continue
  tmp=$(mktemp)
  sed 's/data ?? {}/\(data ?? {}) as any/g' "$f" > "$tmp" && mv "$tmp" "$f"
done

yarn tsc -b

# Copy schema file
echo "Copying schema file..."
cp .pikku/schemas/schemas/PikkuCLIConfig.schema.json cli.schema.json

echo "Copying console app..."
rm -rf console-app
if [ -d "../console/dist" ]; then
  cp -r ../console/dist console-app
fi

echo "Build complete! ✓"
