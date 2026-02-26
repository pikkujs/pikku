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

# Patch stale forge references from published CLI (renamed to node/)
rm -rf .pikku/forge
if [ -f .pikku/pikku-types.gen.ts ]; then
  tmp=$(mktemp)
  sed "s|./forge/pikku-forge-types.gen.js|./node/pikku-node-types.gen.js|g" .pikku/pikku-types.gen.ts > "$tmp" && mv "$tmp" .pikku/pikku-types.gen.ts
fi
mkdir -p .pikku/node && echo "export {}" > .pikku/node/pikku-node-types.gen.ts

# Patch legacy field names and stale imports in bootstrapped files
while IFS= read -r -d '' f; do
  tmp=$(mktemp)
  sed -e 's/pikkuFuncName/pikkuFuncId/g' \
      -e 's/queueName:/name:/g' \
      -e "s|import { pikkuState, FunctionsMeta } from '@pikku/core'|import { pikkuState } from '@pikku/core/internal'\nimport type { FunctionsMeta } from '@pikku/core'|g" \
      -e "s|import { pikkuState } from '@pikku/core'|import { pikkuState } from '@pikku/core/internal'|g" \
      -e "s|import { pikkuState as __pikkuState } from '@pikku/core'|import { pikkuState as __pikkuState } from '@pikku/core/internal'|g" \
      -e "s|import { addPackageServiceFactories } from '@pikku/core'|import { pikkuState } from '@pikku/core/internal'|g" \
      -e "s|addPackageServiceFactories('\([^']*\)', {|pikkuState('\1', 'package', 'factories', {|g" \
      "$f" > "$tmp" && mv "$tmp" "$f"
done < <(find .pikku \( -name '*.ts' -o -name '*.json' \) -print0)

# Build TypeScript (may fail if published CLI generates stale types)
echo "Building TypeScript to dist..."
yarn tsc -b || true

# Patch stale wireMCPTool import in compiled output (removed in current version)
if [ -f dist/.pikku/mcp/pikku-mcp-types.gen.js ]; then
  tmp=$(mktemp)
  sed -e 's/wireMCPTool as wireMCPToolCore, //g' \
      -e 's/wireMCPToolCore(mcpTool);//g' \
      dist/.pikku/mcp/pikku-mcp-types.gen.js > "$tmp" && mv "$tmp" dist/.pikku/mcp/pikku-mcp-types.gen.js
fi

# Rebuild Pikku using the local CLI and recompile
yarn pikku
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
