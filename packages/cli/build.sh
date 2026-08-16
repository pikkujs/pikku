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
# The whole set moves together or none of it does. The 2026-08-03 wave went out
# inside 62 seconds — inspector 00:16:45, core 00:16:47, better-auth 00:16:54,
# cli 00:17:47 — so these four are members of one release.
#
# The previous pin (cli 0.12.83 / core 0.12.64) had to move: the workspace now
# calls `signedContentPath` from @pikku/node-http-server, and core 0.12.64
# predates that export, so the bootstrap CLI died loading the tree it was meant
# to inspect. A pin is only as good as the exports that tree depends on.
#
# Historical note, still relevant when choosing a version: 0.12.36 shipped a
# `@pikku/better-auth: workspace:*` dependency that leaked verbatim to npm and
# is uninstallable, so bootstrapping off `latest` can self-deadlock.
echo "Bootstrapping with published @pikku/cli..."
: "${PIKKU_CLI_VERSION:=0.12.96}"
: "${PIKKU_INSPECTOR_VERSION:=0.12.52}"
: "${PIKKU_BETTER_AUTH_VERSION:=0.12.20}"
# core is a *peer* of both the CLI and the inspector, which is why it has to be
# named here to exist at all once peer resolution is off.
: "${PIKKU_CORE_VERSION:=0.12.79}"
# @pikku/node-http-server is the third member of this family to need naming, and
# it arrives the same way @pikku/kysely did: transitively, through the CLI's
# `^0.12.7`, so it floats to the newest release while `overrides` holds core
# still. The 2026-08-06 09:08 wave published node-http-server 0.12.8 — which
# imports `@pikku/core/node-host-resolver` — one second before core 0.12.79, the
# first core to export that subpath. The pin held core at 0.12.77, so the new
# server landed on the old core and every bootstrap died on a missing export, in
# a package the pin never mentioned. main went red without a commit to blame:
# its last green run had started twenty-one minutes before the wave.
: "${PIKKU_NODE_HTTP_SERVER_VERSION:=0.12.8}"
# @pikku/kysely is an ordinary *dependency* of the CLI, so unlike the peers above
# it installs whether or not it is named — and left unnamed it floats on the
# CLI's `^0.13.7`, which means the newest release wave, not the wave this pin
# describes. That is not a hypothetical: publishing @pikku/kysely@0.13.10 (the
# first version to import `createSecretValue`) alongside core 0.12.77 broke every
# build within the hour, because the floating kysely landed next to the pinned
# core 0.12.74 that predates the symbol. Every build since had failed with an
# error naming a package the change never touched.
#
# So it is pinned like the rest: 0.13.10 peers on core ^0.12.77, which is why
# core moved up with it. The whole set moves together or none of it does.
: "${PIKKU_KYSELY_VERSION:=0.13.10}"
# @pikku/schedule is the fourth to arrive this way, and it is worth naming what
# these four have in common: a package the CLI reaches transitively, on a range,
# that is free to land on a *later* release wave than the one this pin describes.
# Unpinned it floats on the CLI's `^0.12.4`. Then 0.12.5 moved the adapter names
# it imports onto a subpath that #1308 has since deleted, so no core this
# bootstrap can resolve defines it. Landing beside the pinned core it does not
# fail on a missing *symbol* but on a missing *subpath*, which node reports
# before any of this file's patch passes get to run:
#
#   Package subpath '...' is not defined by "exports" in
#   @pikku/core/package.json imported from @pikku/schedule/dist/...
#
# Held at 0.12.4, which predates the move. The pin lifts when a published
# schedule imports the subpath that replaced it, `@pikku/core/state`.
: "${PIKKU_SCHEDULE_VERSION:=0.12.4}"
# @pikku/ws is the fifth, and it failed the same way one wave later: 0.12.6 made
# the same move, so an unpinned ws reproduces the missing-subpath error verbatim,
# this time through pikku-ws-server.js. 0.12.5 predates the move and peers on
# core ^0.12.73.
: "${PIKKU_WS_VERSION:=0.12.5}"
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
    "@pikku/node-http-server": "${PIKKU_NODE_HTTP_SERVER_VERSION}",
    "@pikku/kysely": "${PIKKU_KYSELY_VERSION}",
    "@pikku/schedule": "${PIKKU_SCHEDULE_VERSION}",
    "@pikku/ws": "${PIKKU_WS_VERSION}",
    "better-auth": "${BETTER_AUTH_LIB_VERSION}"
  },
  "overrides": {
    "@pikku/better-auth": "${PIKKU_BETTER_AUTH_VERSION}",
    "@pikku/inspector": "${PIKKU_INSPECTOR_VERSION}",
    "@pikku/core": "${PIKKU_CORE_VERSION}",
    "@pikku/node-http-server": "${PIKKU_NODE_HTTP_SERVER_VERSION}",
    "@pikku/kysely": "${PIKKU_KYSELY_VERSION}",
    "@pikku/schedule": "${PIKKU_SCHEDULE_VERSION}",
    "@pikku/ws": "${PIKKU_WS_VERSION}",
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
      -e "s|import { pikkuState as __pikkuState, CreateWireServices } from '@pikku/core/internal'|import { pikkuState as __pikkuState } from '@pikku/core/state'\nimport type { CreateWireServices } from '@pikku/core/types'|g" \
      -e "s|@pikku/core/internal|@pikku/core/state|g" \
      "$f" > "$tmp" && mv "$tmp" "$f"
done < <(find .pikku \( -name '*.ts' -o -name '*.json' \) -print0)
# Write the leaf subpath entries the pinned CLI predates. `#pikku/<leaf>`
# resolves to `.pikku/<leaf>/index.ts`, and this source tree imports through
# those specifiers — so without them neither the pinned CLI's own schema pass
# (which runtime-imports this source tree) nor the first tsc below can resolve a
# single command file, and the local CLI that would generate them properly never
# gets built. Drop this once PIKKU_CLI_VERSION emits leaf indexes itself.
write_leaf_indexes() {
  for leaf_dir in .pikku/*/; do
    entry=$(find "$leaf_dir" -maxdepth 1 \( -name '*-types.gen.ts' -o -name 'pikku-credentials.gen.ts' -o -name 'auth.types.ts' \) | head -1)
    [ -n "$entry" ] || continue
    printf 'export * from %s\n' "'./$(basename "${entry%.ts}").js'" > "$leaf_dir/index.ts"
  done
}

write_leaf_indexes
"$_bootstrap_dir/node_modules/.bin/pikku"
rm -rf "$_bootstrap_dir"

# Patch stale forge references from published CLI (renamed to node/)
rm -rf .pikku/forge
if [ -f .pikku/pikku-types.gen.ts ]; then
  tmp=$(mktemp)
  sed "s|./forge/pikku-forge-types.gen.js|./node/pikku-node-types.gen.js|g" .pikku/pikku-types.gen.ts > "$tmp" && mv "$tmp" .pikku/pikku-types.gen.ts
fi
mkdir -p .pikku/node && echo "export {}" > .pikku/node/pikku-node-types.gen.ts

write_leaf_indexes

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
      -e "s|import { pikkuState, FunctionsMeta } from '@pikku/core'|import { pikkuState } from '@pikku/core/state'\nimport type { FunctionsMeta } from '@pikku/core/types'|g" \
      -e "s|import { pikkuState } from '@pikku/core'|import { pikkuState } from '@pikku/core/state'|g" \
      -e "s|import { pikkuState as __pikkuState } from '@pikku/core'|import { pikkuState as __pikkuState } from '@pikku/core/state'|g" \
      -e "s|import { pikkuState as __pikkuState, CreateWireServices } from '@pikku/core'|import { pikkuState as __pikkuState } from '@pikku/core/state'\nimport type { CreateWireServices } from '@pikku/core/types'|g" \
      -e "s|import { pikkuState as __pikkuState, CreateWireServices } from '@pikku/core/internal'|import { pikkuState as __pikkuState } from '@pikku/core/state'\nimport type { CreateWireServices } from '@pikku/core/types'|g" \
      -e "s|import { addPackageServiceFactories } from '@pikku/core'|import { pikkuState } from '@pikku/core/state'|g" \
      -e "s|@pikku/core/internal|@pikku/core/state|g" \
      -e "s|addPackageServiceFactories('\([^']*\)', {|pikkuState('\1', 'package', 'factories', {|g" \
      -e 's|addMiddleware as addMiddlewareCore|addTagMiddleware as addTagMiddlewareCore|g' \
      -e 's|addMiddlewareCore(|addTagMiddlewareCore(|g' \
      -e 's|^export const addMiddleware |export const addTagMiddleware |' \
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

# `npx`, not `yarn tsc -b`: the package's `tsc` script chains a second pass over
# tsconfig.type-tests.json, and yarn appends `-b` to the end of the whole chain,
# where it lands on the `-p` invocation and fails as an unknown option.
npx tsc -b

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
