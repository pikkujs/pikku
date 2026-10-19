#!/bin/bash
# Runs the packed CLI through bunx in a clean dir against the workspace's own
# @pikku packages (see cli-bunx-smoke-pack.mjs), then checks that a bunx cache
# whose lockfile holds a @pikku/core below the CLI's range moves core forward
# when the CLI is upgraded.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

core_range=$(bun "$root/scripts/cli-bunx-smoke-pack.mjs" "$root" "$work")
published_tgz=$(ls "$work"/pikku-cli-*.tgz)
cli_tgz=$(ls "$work"/cli/pikku-cli-*.tgz)

stale_core=$(npm view @pikku/core versions --json | bun -e '
  const range = process.argv[1]
  const floor = range.replace(/^[\^~>=]+/, "")
  const versions = JSON.parse(await Bun.stdin.text())
  console.log(versions.filter((v) => !v.includes("-") && Bun.semver.order(v, floor) < 0).at(-1))
' "$core_range")

app="$work/app"
mkdir -p "$app/src"
echo '{"srcDirectories":["./src"],"outDir":"./.pikku","tsconfig":"./tsconfig.json"}' > "$app/pikku.config.json"
echo '{}' > "$app/tsconfig.json"
echo "{\"name\":\"cli-bunx-smoke\",\"private\":true,\"dependencies\":{\"@pikku/core\":\"$core_range\"}}" > "$app/package.json"

echo "Clean bunx cache"
mkdir "$work/tmp-clean"
(cd "$app" && TMPDIR="$work/tmp-clean/" bunx --bun -p "@pikku/cli@file:$cli_tgz" pikku update)

echo "Stale bunx cache holding @pikku/core@$stale_core (CLI wants $core_range)"
cache="$work/cache"
mkdir "$cache"
echo "{\"dependencies\":{\"@pikku/core\":\"$stale_core\"}}" > "$cache/package.json"
(cd "$cache" && bun install >/dev/null 2>&1)
echo "{\"dependencies\":{\"@pikku/cli\":\"file:$published_tgz\"}}" > "$cache/package.json"
(cd "$cache" && bun install >/dev/null 2>&1)
bun -e '
  const cli = process.argv[1] + "/node_modules/@pikku/cli"
  const range = process.argv[2]
  const core = Bun.resolveSync("@pikku/core/package.json", cli)
  const { version } = await Bun.file(core).json()
  if (!Bun.semver.satisfies(version, range)) {
    console.error(`@pikku/cli resolves @pikku/core@${version}, outside its ${range}`)
    process.exit(1)
  }
  console.log(`@pikku/cli resolves @pikku/core@${version}`)
' "$cache" "$core_range"
