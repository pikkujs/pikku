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
}

if [ "${1:-}" = "pikku" ]; then
  run_pikku
  exit 0
fi

run_pikku
tsc
copy_generated_types
