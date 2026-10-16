#!/bin/bash
# A/B timing + peak RSS. usage: bench.sh <projectDir> <goBinary> <runs> <outDir>
P=$1; GO=$2; N=${3:-5}; OUT=$4; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
for i in $(seq 1 "$N"); do
  for mode in go ts-full ts-slice; do
    case $mode in
      go) cmd=("$GO" -timing "$P");;
      ts-full) cmd=(node "$HERE/ref.mjs" "$P" "$OUT/tmp.json" full);;
      ts-slice) cmd=(node "$HERE/ref.mjs" "$P" "$OUT/tmp.json" slice);;
    esac
    s=$(python3 -c 'import time;print(time.time())')
    /usr/bin/time -l "${cmd[@]}" >"$OUT/stdout" 2>"$OUT/stderr"
    e=$(python3 -c 'import time;print(time.time())')
    rss=$(awk '/maximum resident set size/{print $1}' "$OUT/stderr")
    info=$( (grep -h '^{' "$OUT/stderr" "$OUT/stdout" | grep programMs) | tail -1)
    echo "$mode wall=$(python3 -c "print(round(($e-$s)*1000))") rss=$rss $info"
  done
done
