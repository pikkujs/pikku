#!/bin/bash
set -euo pipefail

echo "Starting Pikku CLI build process..."

# Clean .pikku directory and dist
test -f package.json || { echo "Refusing to run outside package root"; exit 1; }
# .pikku/remote is kept: it caches the registry SDK the local CLI's `pikku all`
# syncs below, checked against pikku-addons.lock's sha512 on every run
# (knowledge: the-cli-syncs-its-registry-sdk-like-any-consumer).
if [ -d .pikku ]; then
  find .pikku -mindepth 1 -maxdepth 1 ! -name remote -exec rm -rf -- {} +
fi
rm -rf -- dist

# Collect the worked examples into src/examples.gen.ts before anything compiles.
# The recipes are real files; the bundler only carries the JS import graph, so a
# recipe read from disk ships to npm and not to the `bun --compile` binaries.
node scripts/embed-examples.mjs

# Bootstrap using the published CLI - generates all .pikku files.
#
# The newest published @pikku/cli is installed with nothing pinned and no
# `overrides`. A published manifest is a consistent set by construction: every
# range the CLI declares was resolvable when it shipped, and the packages it
# names are published before it. Pinning part of the set is what broke this
# build seven times (inspector, core, node-http-server, kysely, schedule, ws,
# knowledge, code-edit): each pin froze one package while the rest of the graph
# floated to a later release wave. Peers are resolved by npm rather than named
# one by one, so `better-auth` and `ws` arrive on their own.
#
# PIKKU_CLI_VERSION selects another release, as one choice, for a rollback or
# for testing a candidate. Nothing else here names a version.
#
# The check after the install fails the build at once, naming the resolved set,
# when the install did not produce a CLI that loads.
echo "Bootstrapping with published @pikku/cli..."
: "${PIKKU_CLI_VERSION:=latest}"
_bootstrap_dir=$(mktemp -d)
trap 'rm -rf "$_bootstrap_dir"' EXIT
cat > "$_bootstrap_dir/package.json" <<JSON
{
  "name": "pikku-bootstrap",
  "private": true,
  "dependencies": {
    "@pikku/cli": "${PIKKU_CLI_VERSION}"
  }
}
JSON
(cd "$_bootstrap_dir" && npm install --no-save --no-package-lock)
# Fail early, with the resolved versions on screen, when the bootstrap CLI does
# not load. The import is the module `dist/bin/pikku.js` loads to run the CLI, so
# a package that floated onto a release its neighbours do not match dies here,
# on the first import, instead of halfway through the codegen below.
_bootstrap_versions=$(cd "$_bootstrap_dir" && node -e '
  const fs = require("fs"), path = require("path")
  const dir = path.join("node_modules", "@pikku")
  for (const name of fs.readdirSync(dir).sort()) {
    const { version } = JSON.parse(fs.readFileSync(path.join(dir, name, "package.json"), "utf8"))
    console.log("  @pikku/" + name + " " + version)
  }
')
echo "Bootstrap tree resolved:"
echo "$_bootstrap_versions"
if ! _bootstrap_load=$(cd "$_bootstrap_dir" && node --input-type=module -e \
  "await import('./node_modules/@pikku/cli/dist/.pikku/cli/pikku-cli.gen.js')" 2>&1); then
  echo "ERROR: the published @pikku/cli (${PIKKU_CLI_VERSION}) does not load:" >&2
  echo "$_bootstrap_load" | tail -n 8 >&2
  echo "Resolved set:" >&2
  echo "$_bootstrap_versions" >&2
  echo "Set PIKKU_CLI_VERSION to a release that loads, or fix the package named above." >&2
  exit 1
fi
# Hiding the registry wirings from codegen is for the one build that cannot reach
# the registry (PIKKU_CLI_WITHOUT_REGISTRY_SDK=1, below): the CLI then still calls
# the registry at runtime, through the wiring imported by hand.
# knowledge: the-cli-syncs-its-registry-sdk-like-any-consumer
_registry_wirings="registry cloud-api"
_registry_hidden_dir=$(mktemp -d)
_hide_registry_wiring() {
  for w in $_registry_wirings; do
    mv "src/$w.wiring.ts" "$_registry_hidden_dir/$w.wiring.ts"
  done
  cp pikku-addons.lock "$_registry_hidden_dir/pikku-addons.lock"
}
_restore_registry_wiring() {
  for w in $_registry_wirings; do
    if [ -f "$_registry_hidden_dir/$w.wiring.ts" ]; then
      mv "$_registry_hidden_dir/$w.wiring.ts" "src/$w.wiring.ts"
    fi
  done
  # A run that never saw the wirings rewrites the lock without their entries.
  if [ -f "$_registry_hidden_dir/pikku-addons.lock" ]; then
    mv "$_registry_hidden_dir/pikku-addons.lock" pikku-addons.lock
  fi
}
_import_registry_wiring() {
  for w in $_registry_wirings; do
    if ! grep -qx "import '../src/$w.wiring.js'" .pikku/pikku-bootstrap.gen.ts; then
      printf "\nimport '../src/$w.wiring.js'\n" >> .pikku/pikku-bootstrap.gen.ts
    fi
  done
}
trap 'rm -rf "$_bootstrap_dir"; _restore_registry_wiring; rm -rf "$_registry_hidden_dir"' EXIT
# The published CLI checks every wireAddon() against the addon's built metadata
# and refuses to continue when it is missing (critical: "has not been built").
# The addons are built from this CLI, further down, so an empty placeholder
# stands in until then and is overwritten by that build.
for _addon in ../addon/pikku-changes-cli ../addon/pikku-cloud-cli; do
  _meta="$_addon/dist/.pikku/addon/function/pikku-functions-meta.gen.json"
  if [ ! -f "$_meta" ]; then
    mkdir -p "$(dirname "$_meta")"
    echo "{}" > "$_meta"
  fi
done
# `bootstrap` writes the type files first, because `all`'s zod schema generation
# imports the tree that phase leaves behind.
"$_bootstrap_dir/node_modules/.bin/pikku" bootstrap
"$_bootstrap_dir/node_modules/.bin/pikku"
rm -rf "$_bootstrap_dir"

# Build TypeScript (may fail if published CLI generates stale types)
echo "Building TypeScript to dist..."
npx tsc -b || true

# The pikku CLI imports the bootstraps of @pikku/addon-changes-cli and
# @pikku/addon-cloud-cli at startup (it wires the `changes` and `cloud` command
# groups from them), and the addons are built by the CLI, and they import
# `@pikku/cli/addon-support`, which the tsc pass above has just emitted. So the
# order is: CLI tsc (this tolerated pass), then the addons — changes first,
# because the cloud addon registers its changes backend through
# `@pikku/addon-changes-cli/backend` — then the CLI's own codegen and strict tsc
# below, which read the addons' contract metadata. On a clean checkout an addon
# has no dist yet, so a placeholder bootstrap lets the CLI start long enough to
# build it.
_shim_dir=$(mktemp -d)
printf '#!/bin/sh\nexec node "%s" "$@"\n' "$PWD/dist/bin/pikku.js" > "$_shim_dir/pikku"
chmod +x "$_shim_dir/pikku"
for _addon in ../addon/pikku-changes-cli ../addon/pikku-cloud-cli; do
  if [ ! -f "$_addon/dist/.pikku/addon/pikku-bootstrap.gen.js" ]; then
    mkdir -p "$_addon/dist/.pikku/addon"
    echo "export {}" > "$_addon/dist/.pikku/addon/pikku-bootstrap.gen.js"
  fi
done
for _addon in ../addon/pikku-changes-cli ../addon/pikku-cloud-cli; do
  echo "Building $_addon..."
  (cd "$_addon" && PATH="$_shim_dir:$PATH" bun run build)
done

# Rebuild Pikku using the local CLI and recompile. `node`, not `npx pikku`: the
# chmod that makes `dist/bin/pikku.js` executable only happens further down, so
# execing it directly here exits 126 — and an `npx` that cannot find a runnable
# local bin goes to the registry and runs the published CLI instead.
#
# This run syncs the registry SDK into .pikku/remote, like any consumer's
# `pikku all`. PIKKU_CLI_WITHOUT_REGISTRY_SDK=1 builds without it, for a
# machine that cannot reach the registry: the wiring is hidden from codegen as
# in the bootstrap stage and imported by hand, so the CLI still calls the
# registry at runtime, and `registry:resolveSdk` is typed by the contract
# remote-addon-sync.ts mirrors instead of by the SDK.
if [ "${PIKKU_CLI_WITHOUT_REGISTRY_SDK:-}" = "1" ]; then
  echo "PIKKU_CLI_WITHOUT_REGISTRY_SDK=1: building without the registry SDK."
  _hide_registry_wiring
  node dist/bin/pikku.js
  _restore_registry_wiring
  _import_registry_wiring
else
  node dist/bin/pikku.js
fi

# `npx`, not `bun run tsc -b`: the package's `tsc` script chains a second pass over
# tsconfig.type-tests.json, and a package-manager run appends `-b` to the end of the whole chain,
# where it lands on the `-p` invocation and fails as an unknown option.
npx tsc -b

# The tolerated pass compiled the bootstrap CLI's .pikku tree, including leaf
# indexes the local CLI's codegen no longer writes (`.pikku/node/index.ts`). tsc
# never deletes what it emitted, so drop the output whose source is gone before
# it is packed (`check:orphaned-build-output` fails on it).
while IFS= read -r -d '' out; do
  stem=${out#dist/}
  stem=${stem%.map}
  stem=${stem%.js}
  stem=${stem%.d.ts}
  [ -e "$stem.ts" ] || [ -e "$stem.d.ts" ] || rm -f -- "$out"
done < <(find dist/.pikku -type f \( -name '*.js' -o -name '*.d.ts' -o -name '*.map' \) -print0)

# tsc does not carry a source file's mode across, so the file `bin.pikku` points
# at comes out non-executable and every `npx pikku` exits 126.
chmod +x dist/bin/pikku.js

# Generate the public surface doc.
#
# The surface comes in two halves. This one describes the framework — which
# `#pikku/*` leaves an application gets, which an addon gets, and what each one
# exports — so it is the same for every project on a given CLI version, and
# computing it here costs users nothing. The other half, the per-project usage
# overlay, is written by `pikku all` into a project's own outDir.
#
# Both modes are generated rather than listed: the app/addon difference lives in
# the codegen (an addon's leaves omit `wireHTTP` and friends), so the only
# honest way to describe it is to run the codegen twice and read what came out.
# recipes/functions wires the console, whose functions require `pikku:console`,
# a scope @pikku/addon-console declares. A release builds packages before addons,
# so without this the scope is undeclared here and the inspector fails with
# PKU124. Declaring it in the template instead collides with the addon once built.
echo "Building @pikku/addon-console for its scope declarations..."
# No `pikku` bin is linked on a clean install (dist/bin/pikku.js did not exist
# when bun linked workspace bins), so put the CLI just built on PATH.
_shim_dir=$(mktemp -d)
printf '#!/bin/sh\nexec node "%s" "$@"\n' "$PWD/dist/bin/pikku.js" > "$_shim_dir/pikku"
chmod +x "$_shim_dir/pikku"
(cd ../addon/pikku-console && PATH="$_shim_dir:$PATH" bun run build)
rm -rf "$_shim_dir"

echo "Generating the public surface doc..."
_cli_bin="$PWD/dist/bin/pikku.js"
(cd ../../recipes/function-addon && node "$_cli_bin")
(cd ../../recipes/functions && node "$_cli_bin")
node dist/src/functions/surface/generate-surface-doc.js \
  --app ../../recipes/functions \
  --addon ../../recipes/function-addon \
  --snippets ../../templates/online-shop \
  --out surface.json \
  --snippets-out snippets.json \
  --snippets-meta-out snippets-meta.json

# Copy schema file
echo "Copying schema file..."
schema_src=$(find .pikku/schemas -maxdepth 2 -name "PikkuCLIConfig.schema.json" | head -1)
if [ -n "$schema_src" ]; then
  cp "$schema_src" cli.schema.json
else
  echo "Warning: PikkuCLIConfig.schema.json not found, skipping schema copy"
fi

# The addons are private workspace packages that are never published, so the npm
# tarball carries them itself: dist/node_modules/@pikku/<addon> sits on the
# resolution path of every module under dist/, which is how wireAddon and the
# `@pikku/addon-*` imports find them once @pikku/cli is installed from npm.
echo "Bundling addons into dist/node_modules..."
for _addon in changes cloud; do
  _src="../addon/pikku-$_addon-cli"
  _dest="dist/node_modules/@pikku/addon-$_addon-cli"
  mkdir -p "$_dest"
  cp "$_src/package.json" "$_src/LICENSE" "$_dest/"
  cp -R "$_src/dist" "$_dest/dist"
done

# Native CLI binaries, compiled with bun --compile. Nothing in a checkout runs
# them: they exist to be attached to a GitHub Release and fed to the Homebrew
# cask, and the four of them come to about 400 MB per worktree. So a normal build compiles
# none, and PIKKU_CLI_BINARIES asks for them:
#
#   none  the default
#   host  this machine's target; PR CI uses it to prove the CLI still bundles
#   all   every released target; `bun run release` and the Full Suite use it
#
# `all` has to reach `changeset publish` as well as `build:packages`: the CLI's
# prepublishOnly runs this script again, and that second run is the one whose
# output the publish workflow uploads.
PIKKU_CLI_BINARIES="${PIKKU_CLI_BINARIES:-none}"
case "$PIKKU_CLI_BINARIES" in
  none)
    binary_targets=""
    ;;
  host)
    binary_targets=$(node -p "'bun-' + (process.platform === 'win32' ? 'windows' : process.platform) + '-' + process.arch")
    ;;
  all)
    binary_targets="bun-linux-x64 bun-linux-arm64 bun-darwin-arm64 bun-windows-x64"
    ;;
  *)
    echo "PIKKU_CLI_BINARIES must be none, host or all, not '$PIKKU_CLI_BINARIES'" >&2
    exit 1
    ;;
esac

# Cleared on every build, so a host build cannot leave an older build's binaries
# here to be uploaded, and a checkout built before the default changed gets its
# disk back.
rm -rf -- release/binaries

if [ -n "$binary_targets" ]; then
  # Skipping would look like success and publish a release without its binaries.
  command -v bun >/dev/null 2>&1 || { echo "bun is required to compile the CLI binaries" >&2; exit 1; }

  echo "Building native CLI binaries ($PIKKU_CLI_BINARIES)..."
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
import { useSqliteLibrary } from '../src/functions/db/sqlite/sqlite-library.js'
import { PikkuCLI } from '../.pikku/cli/pikku-cli.gen.js'
await useSqliteLibrary()
const updateCheck = checkForUpdate()
await PikkuCLI(process.argv.slice(2))
await updateCheck
process.exit(process.exitCode ?? 0)
ENTRY

  for target in $binary_targets; do
    suffix="${target#bun-}"
    echo "  → $target"
    # istanbul-lib-instrument (babel) uses dynamic requires bun can't bundle;
    # it's only needed for dev --coverage under bun, where node_modules exists.
    bun build --compile "--target=$target" --external istanbul-lib-instrument "--outfile=release/binaries/pikku-$suffix" dist/bin/pikku-bin.mjs
  done

  echo "Native binaries written to release/binaries/"
fi

echo "Build complete! ✓"
