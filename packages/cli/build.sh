#!/bin/bash
set -euo pipefail

echo "Starting Pikku CLI build process..."

# Clean .pikku directory and dist
test -f package.json || { echo "Refusing to run outside package root"; exit 1; }
rm -rf -- .pikku dist

# Bootstrap using the published CLI - generates all .pikku files.
# Pinned to 0.12.35 (not `latest`): 0.12.36 shipped a `@pikku/better-auth:
# workspace:*` dependency that leaked verbatim to npm and is uninstallable, so
# bootstrapping off `latest` self-deadlocks the build. 0.12.35 is the last clean
# release and still uses @pikku/auth-js (matching the install below).
echo "Bootstrapping with published @pikku/cli..."
: "${PIKKU_CLI_VERSION:=0.12.35}"
_bootstrap_dir=$(mktemp -d)
trap 'rm -rf "$_bootstrap_dir"' EXIT
# The published bootstrap CLI's own auth codegen imports the auth package at
# module load, so it must be installed alongside it. This stays @pikku/auth-js
# until a CLI release that imports @pikku/better-auth is published, after which
# this should flip to "@pikku/better-auth".
npm install --prefix "$_bootstrap_dir" --no-save --no-package-lock \
  "@pikku/cli@${PIKKU_CLI_VERSION}" "@pikku/auth-js"
"$_bootstrap_dir/node_modules/.bin/pikku"
rm -rf "$_bootstrap_dir"

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
      -e "s|import { pikkuState as __pikkuState, CreateWireServices } from '@pikku/core'|import { pikkuState as __pikkuState, CreateWireServices } from '@pikku/core/internal'|g" \
      -e "s|import { addPackageServiceFactories } from '@pikku/core'|import { pikkuState } from '@pikku/core/internal'|g" \
      -e "s|addPackageServiceFactories('\([^']*\)', {|pikkuState('\1', 'package', 'factories', {|g" \
      -e 's|addMiddleware as addMiddlewareCore|addTagMiddleware as addTagMiddlewareCore|g' \
      -e 's|addPermission as addPermissionCore|addTagPermission as addTagPermissionCore|g' \
      -e 's|addMiddlewareCore(|addTagMiddlewareCore(|g' \
      -e 's|addPermissionCore(|addTagPermissionCore(|g' \
      -e 's|^export const addMiddleware |export const addTagMiddleware |' \
      -e 's|^export const addPermission |export const addTagPermission |' \
      -e "/metaDir/d" \
      -e "/^try {$/d" \
      -e "/^} catch.*{.*}$/d" \
      -e "/fileURLToPath.*__fileURLToPath/d" \
      -e "/dirname.*__dirname/d" \
      "$f" > "$tmp" && mv "$tmp" "$f"
done < <(find .pikku \( -name '*.ts' -o -name '*.json' \) -print0)

# Build TypeScript (may fail if published CLI generates stale types)
echo "Building TypeScript to dist..."
npx tsc -b || true

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

# Build native CLI binaries for all platforms using bun --compile
if command -v bun >/dev/null 2>&1; then
  echo "Building native CLI binaries..."
  mkdir -p release/binaries

  CLI_VERSION=$(node -p "require('./package.json').version")

  # Write a static entry point that bun can bundle without dynamic imports.
  # Version is baked in as a literal so package.json is not needed at runtime.
  cat > dist/bin/pikku-bin.mjs << ENTRY
process.removeAllListeners('warning')
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' && w.message.includes('SQLite')) return
  process.stderr.write(\`\${w.name}: \${w.message}\n\`)
})
async function checkForUpdate() {
  if (process.env.CI || !process.stderr.isTTY) return
  try {
    const res = await fetch('https://registry.npmjs.org/@pikku/cli/latest', {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return
    const { version: latest } = await res.json()
    if (latest !== '${CLI_VERSION}') {
      process.stderr.write(\`\n  Update available  ${CLI_VERSION} → \${latest}\n  brew upgrade pikku  or  npm install -g @pikku/cli\n\n\`)
    }
  } catch {}
}
import { PikkuCLI } from '../.pikku/cli/pikku-cli.gen.js'
const updateCheck = checkForUpdate()
await PikkuCLI(process.argv.slice(2))
await updateCheck
process.exit(0)
ENTRY

  for target in bun-linux-x64 bun-linux-arm64 bun-darwin-x64 bun-darwin-arm64; do
    suffix="${target#bun-}"
    echo "  → $target"
    bun build --compile "--target=$target" "--outfile=release/binaries/pikku-$suffix" dist/bin/pikku-bin.mjs
  done

  echo "Native binaries written to release/binaries/"
else
  echo "Bun not found — skipping native binary build"
fi

echo "Build complete! ✓"
