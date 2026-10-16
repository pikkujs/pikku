#!/bin/bash
# A/B timing + peak RSS. usage: bench.sh <projectDir> <goBinary> <runs> <outDir>
# The TypeScript side is the protocol stand-in (parity/ts-reference-bin.ts):
# the same analysis `pikku-inspect --stdin` is measured against. Output parity
# is parity/parity.ts's job, not this script's.
P=$1; GO=$2; N=${3:-5}; OUT=$4; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
node "$HERE/../parity/input.ts" "$P" >"$OUT/input.json"
for i in $(seq 1 "$N"); do
  for mode in go ts; do
    case $mode in
      go) cmd=("$GO" -timing "$P");;
      ts) cmd=(node "$HERE/../parity/ts-reference-bin.ts");;
    esac
    s=$(python3 -c 'import time;print(time.time())')
    /usr/bin/time -l "${cmd[@]}" <"$OUT/input.json" >"$OUT/stdout" 2>"$OUT/stderr"
    e=$(python3 -c 'import time;print(time.time())')
    rss=$(awk '/maximum resident set size/{print $1}' "$OUT/stderr")
    info=$( (grep -h '^{' "$OUT/stderr" | grep programMs) | tail -1)
    echo "$mode wall=$(python3 -c "print(round(($e-$s)*1000))") rss=$rss $info"
  done
done
