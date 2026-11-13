#!/usr/bin/env bash
# Builds @pikku/core's API report from two source trees and writes the diff as a
# pull request comment body.
#
#   scripts/api-report-diff.sh <base-tree> <head-tree> <out-dir>
#
# Writes <out-dir>/base.md, head.md, api-report.diff and comment.md. The report
# is generated, never committed, so nothing here reads a baseline from git: both
# sides are built from source, by the same generator (the head tree's, so a PR
# that changes the generator does not diff its own output against the old
# format's).
#
# The report resolves `@pikku/core/*` imports through core's own package exports,
# which point at dist/. In a tree where core is not built those types resolve to
# `any` and the report says so quietly (`jwt: any`), so core is built first and
# the script refuses to continue without dist/.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <base-tree> <head-tree> <out-dir>" >&2
  exit 2
fi

base_tree=$(cd "$1" && pwd)
head_tree=$(cd "$2" && pwd)
mkdir -p "$3"
out=$(cd "$3" && pwd)
marker='<!-- pikku-api-report -->'
# GitHub rejects comment bodies over 65536 characters.
max_diff_bytes=60000

generate() {
  local tree=$1 target=$2
  if [ "$tree" != "$head_tree" ]; then
    cp "$head_tree/packages/core/scripts/generate-api-report.mts" \
      "$tree/packages/core/scripts/generate-api-report.mts"
  fi
  (
    cd "$tree"
    # `--ignore-scripts`: nothing in the report needs a postinstall, and a
    # dependency's download script is a way for a PR to run code here.
    bun install --ignore-scripts
    bun run --filter @pikku/core build
    if [ ! -d packages/core/dist ]; then
      echo "packages/core/dist is missing after the build; the report would type its own exports as any" >&2
      exit 1
    fi
    (cd packages/core && npx tsx scripts/generate-api-report.mts "$target")
  )
}

generate "$base_tree" "$out/base.md"
generate "$head_tree" "$out/head.md"

# `diff` exits 1 when the files differ, which is the interesting case.
git diff --no-index --no-color --unified=3 -- "$out/base.md" "$out/head.md" |
  sed -e '1,/^+++ /d' >"$out/api-report.diff" || true

{
  echo "$marker"
  echo "## Public API report"
  echo
  if [ ! -s "$out/api-report.diff" ]; then
    echo "No public API changes in \`@pikku/core\`."
  else
    added=$(grep -c '^+' "$out/api-report.diff" || true)
    removed=$(grep -c '^-' "$out/api-report.diff" || true)
    echo "\`@pikku/core\`'s public API changes in this PR (+$added / -$removed report lines). Generated from the base and from this PR's merge result; nothing is committed."
    echo
    echo '```diff'
    if [ "$(wc -c <"$out/api-report.diff")" -gt "$max_diff_bytes" ]; then
      head -c "$max_diff_bytes" "$out/api-report.diff" | sed '$d'
      echo '... (truncated; the full diff is in the workflow run summary and artifact)'
    else
      cat "$out/api-report.diff"
    fi
    echo '```'
  fi
} >"$out/comment.md"

echo "wrote $out/comment.md"
