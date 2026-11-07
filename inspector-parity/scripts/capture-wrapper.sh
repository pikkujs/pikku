#!/bin/bash
# Records every request the CLI sends to the inspector, then runs the real binary.
# Used as PIKKU_INSPECTOR_GO_BIN / PIKKU_INSPECTOR_RS_BIN. Set CAPTURE_REAL_BIN to the
# binary to run and CAPTURE_DIR to the directory that receives the requests:
#   <seq>.args  one argument per line (e.g. --stdin, serve, helper\nname)
#   <seq>.in    stdin, byte for byte (the JSON request, or the NDJSON a serve session sent)
dir="${CAPTURE_DIR:?CAPTURE_DIR not set}"
mkdir -p "$dir"
seq="$(date +%s%N)-$$"
printf '%s\n' "$@" > "$dir/$seq.args"
set -o pipefail
tee "$dir/$seq.in" | "${CAPTURE_REAL_BIN:?CAPTURE_REAL_BIN not set}" "$@"
