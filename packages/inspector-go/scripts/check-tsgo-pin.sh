#!/usr/bin/env bash
# Fails if typescript-go has moved off the exact pin, or if shim/ no longer
# matches what tools/gen_shims generates from it. Bumping the pin is the
# procedure in PORTING.md ("typescript-go pin"), which updates PINNED below.
set -euo pipefail

PINNED=v0.0.0-20260708042240-2bd066d87f5b
MODULE=github.com/microsoft/typescript-go

cd "$(dirname "$0")/.."
status=0

resolved=$(go list -m -f '{{.Version}}' "$MODULE")
if [ "$resolved" != "$PINNED" ]; then
  echo "::error::go.mod resolves $MODULE $resolved, pinned at $PINNED (see PORTING.md, typescript-go pin)"
  status=1
fi

# A shim go.mod may leave the requirement to the main module (shim/printer
# does), but one that names typescript-go must name the pin.
for mod in shim/*/go.mod shim/*/*/go.mod; do
  [ -f "$mod" ] || continue
  drift=$(grep -E "$MODULE v" "$mod" | grep -v "$MODULE $PINNED" || true)
  if [ -n "$drift" ]; then
    echo "::error file=packages/inspector-go/$mod::$mod has "$drift", pinned at $PINNED"
    status=1
  fi
done

go mod verify

go run ./tools/gen_shims
if ! git diff --exit-code -- shim; then
  echo "::error::shim/ is stale: run \`go run ./tools/gen_shims\` in packages/inspector-go and commit the result"
  status=1
fi
untracked=$(git ls-files --others --exclude-standard -- shim)
if [ -n "$untracked" ]; then
  echo "::error::tools/gen_shims wrote untracked files: $untracked"
  status=1
fi

exit $status
