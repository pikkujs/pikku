#!/bin/bash
set -euo pipefail

echo "Starting Pikku CLI build process..."

# Clean .pikku directory and dist
test -f package.json || { echo "Refusing to run outside package root"; exit 1; }
rm -rf -- .pikku dist

# Bootstrap using the published CLI - generates all .pikku files.
#
# Pin the CLI *and* the inspector together. They share the inspector state
# shape, and only the CLI was pinned before: when 0.12.43 dropped
# `state.http.routePermissions` (the authz simplification), the floating
# inspector paired with the pinned 0.12.35 CLI, which still read
# `routePermissions.size`, and every bootstrap build broke at once — including
# on main, which had been green minutes earlier.
#
# 0.12.83 is the CLI from that same release wave, so it matches 0.12.43. It
# imports @pikku/better-auth rather than @pikku/auth-js, which is why the
# bootstrap installs better-auth directly instead of overriding it.
#
# Historical note, still relevant when choosing a version: 0.12.36 shipped a
# `@pikku/better-auth: workspace:*` dependency that leaked verbatim to npm and
# is uninstallable, so bootstrapping off `latest` can self-deadlock.
echo "Bootstrapping with published @pikku/cli..."
: "${PIKKU_CLI_VERSION:=0.12.83}"
: "${PIKKU_INSPECTOR_VERSION:=0.12.43}"
: "${PIKKU_BETTER_AUTH_VERSION:=0.12.12}"
# core 0.12.64 went out 40 seconds before cli 0.12.83, so it is the third member
# of that same wave. It is a *peer* of both the CLI and the inspector, which is
# why it has to be named here to exist at all once peer resolution is off.
: "${PIKKU_CORE_VERSION:=0.12.64}"
# The other peer that has to be named: @pikku/better-auth peers on the upstream
# `better-auth` library and imports it at module load, so without it the
# bootstrap CLI dies on "Cannot find package 'better-auth'".
: "${BETTER_AUTH_LIB_VERSION:=1.6.25}"
_bootstrap_dir=$(mktemp -d)
trap 'rm -rf "$_bootstrap_dir"' EXIT
# The published bootstrap CLI's own auth codegen imports the auth package at
# module load, so it must be installed alongside it. 0.12.83 imports
# @pikku/better-auth, so that is what goes in.
#
# The inspector is listed explicitly, not left to float: it and the CLI share
# the inspector state shape, so resolving it by range lets a later release pair
# a new state with an older reader. Both move together or neither does.
#
# Declaring the bootstrap deps in a package.json is what lets `overrides` apply
# during resolution — npm ignores `overrides` for packages passed as install
# args. It is kept as a guard against an unconverted `workspace:*` specifier
# leaking into a published manifest, as @pikku/cli@0.12.36 did.
cat > "$_bootstrap_dir/package.json" <<JSON
{
  "name": "pikku-bootstrap",
  "private": true,
  "dependencies": {
    "@pikku/cli": "${PIKKU_CLI_VERSION}",
    "@pikku/inspector": "${PIKKU_INSPECTOR_VERSION}",
    "@pikku/better-auth": "${PIKKU_BETTER_AUTH_VERSION}",
    "@pikku/core": "${PIKKU_CORE_VERSION}",
    "better-auth": "${BETTER_AUTH_LIB_VERSION}"
  },
  "overrides": {
    "@pikku/better-auth": "${PIKKU_BETTER_AUTH_VERSION}",
    "@pikku/inspector": "${PIKKU_INSPECTOR_VERSION}",
    "@pikku/core": "${PIKKU_CORE_VERSION}",
    "better-auth": "${BETTER_AUTH_LIB_VERSION}"
  }
}
JSON
# --legacy-peer-deps, because this tree is a throwaway runner for one codegen
# pass and every package it needs is now pinned above. Left on, peer resolution
# reaches across the whole floating transitive graph — @pikku/cli@0.12.83 depends
# on `@pikku/kysely: ^0.13.1`, so every release wave drags in a kysely whose peer
# on @pikku/core has moved ahead of what the registry is serving for this tree.
# That is not hypothetical: publishing @pikku/kysely@0.13.6 (peer core ^0.12.71)
# seconds before @pikku/cli@0.12.92 sent npm backtracking for thirty minutes over
# ~100k ERESOLVE warnings until it aborted, and the CLI was the one package in
# that release that did not publish. Peers here buy nothing — nothing consumes
# this tree — and cost the release.
(cd "$_bootstrap_dir" && npm install --no-save --no-package-lock --legacy-peer-deps)
# Split into `bootstrap` (setup phase: type files only) and then the default
# `all`, with a rename pass in between, because `all`'s zod schema generation
# *imports* the tree the setup phase has just written.
#
# The pinned CLI emits `export { wireSecret } from '@pikku/core/secret'`, and the
# local @pikku/core no longer exports that name — the declaration helpers are
# `defineSecret` / `defineVariable` / `defineScope` / `defineCredential` now. Run
# as one `all`, the import throws and takes the whole bootstrap with it, long
# before the patch loop further down could rewrite anything. Renaming between the
# two phases puts the fix ahead of the first thing that loads the files.
#
# `all` regenerates those same files with the old names again on its way out;
# the patch loop below is what leaves the tree consistent for tsc.
#
# Collapse this back into a single `pikku` call once PIKKU_CLI_VERSION moves past
# the rename.
"$_bootstrap_dir/node_modules/.bin/pikku" bootstrap
while IFS= read -r -d '' f; do
  tmp=$(mktemp)
  sed -e 's|wireScope|defineScope|g' \
      -e 's|wireSecret|defineSecret|g' \
      -e 's|wireVariable|defineVariable|g' \
      -e 's|wireCredential|defineCredential|g' \
      "$f" > "$tmp" && mv "$tmp" "$f"
done < <(find .pikku \( -name '*.ts' -o -name '*.json' \) -print0)
"$_bootstrap_dir/node_modules/.bin/pikku"
rm -rf "$_bootstrap_dir"

# Patch stale forge references from published CLI (renamed to node/)
rm -rf .pikku/forge
if [ -f .pikku/pikku-types.gen.ts ]; then
  tmp=$(mktemp)
  sed "s|./forge/pikku-forge-types.gen.js|./node/pikku-node-types.gen.js|g" .pikku/pikku-types.gen.ts > "$tmp" && mv "$tmp" .pikku/pikku-types.gen.ts
fi
mkdir -p .pikku/node && echo "export {}" > .pikku/node/pikku-node-types.gen.ts

# Patch legacy field names and stale imports in bootstrapped files.
#
# The wire*→define* substitutions below cover the declaration helpers
# (`defineScope`/`defineSecret`/`defineVariable`/`defineCredential`). The pinned
# bootstrap CLI still emits the old `wire*` re-exports into .pikku, and the local
# @pikku/core no longer exports those names, so the bootstrapped tree fails to
# load before the local CLI ever gets to regenerate it. Drop these once
# PIKKU_CLI_VERSION moves past the rename.
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
      -e 's|wireScope|defineScope|g' \
      -e 's|wireSecret|defineSecret|g' \
      -e 's|wireVariable|defineVariable|g' \
      -e 's|wireCredential|defineCredential|g' \
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

# tsc does not carry a source file's mode across, so the file `bin.pikku` points
# at comes out non-executable and every `npx pikku` exits 126.
chmod +x dist/bin/pikku.js

# Copy schema file
echo "Copying schema file..."
schema_src=$(find .pikku/schemas -maxdepth 2 -name "PikkuCLIConfig.schema.json" | head -1)
if [ -n "$schema_src" ]; then
  cp "$schema_src" cli.schema.json
else
  echo "Warning: PikkuCLIConfig.schema.json not found, skipping schema copy"
fi

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

  for target in bun-linux-x64 bun-linux-arm64 bun-darwin-x64 bun-darwin-arm64 bun-windows-x64; do
    suffix="${target#bun-}"
    echo "  → $target"
    # istanbul-lib-instrument (babel) uses dynamic requires bun can't bundle;
    # it's only needed for dev --coverage under bun, where node_modules exists.
    bun build --compile "--target=$target" --external istanbul-lib-instrument "--outfile=release/binaries/pikku-$suffix" dist/bin/pikku-bin.mjs
  done

  echo "Native binaries written to release/binaries/"
else
  echo "Bun not found — skipping native binary build"
fi

echo "Build complete! ✓"
