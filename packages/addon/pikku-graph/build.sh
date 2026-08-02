#!/bin/bash
set -euo pipefail

run_pikku() {
  if [ -f ../../cli/dist/bin/pikku.js ]; then
    node ../../cli/dist/bin/pikku.js all
    return
  fi

  : "${PIKKU_CLI_VERSION:=latest}"
  npx -y "@pikku/cli@${PIKKU_CLI_VERSION}" all
}

copy_generated_types() {
  mkdir -p dist/.pikku/rpc dist/.pikku/agent dist/.pikku/workflow
  cp .pikku/rpc/*.d.ts dist/.pikku/rpc/ 2>/dev/null || true
  cp .pikku/agent/*.d.ts dist/.pikku/agent/ 2>/dev/null || true
  cp .pikku/workflow/*.d.ts dist/.pikku/workflow/ 2>/dev/null || true
  copy_verbose_meta
}

# tsc only emits the JSON it sees imported, and nothing imports the verbose meta
# — it exists for consumers, not for this package's own runtime. Without this the
# published addon ships only the stripped copy, which has had `description`
# removed, and every function it exports is offered to a model under its bare
# name.
copy_verbose_meta() {
  local file
  for file in $(find .pikku -name '*-verbose.gen.json'); do
    mkdir -p "dist/$(dirname "$file")"
    cp "$file" "dist/$file"
  done
}

if [ "${1:-}" = "pikku" ]; then
  run_pikku
  exit 0
fi

run_pikku
tsc
copy_generated_types
