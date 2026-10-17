#!/bin/bash
# A/B wall time + peak RSS of the analysis (inspect() up to finalize).
# usage: bench.sh <projectDir> <goBinary> [runs] [outDir] [--schemas]
#   go          pikku-inspect <projectDir>
#   ts-analyze  bench/ref-analyze.mjs (the same steps through the TS inspector)
# Both print a JSON line whose wallMs/analyzeMs is the in-process time; wall
# here is the whole process, including Node/Go start-up.
P=$1; GO=$2; N=${3:-5}; OUT=${4:-$(mktemp -d)}; SCHEMAS=$5; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
goflags=(-timing); tsflags=()
if [ "$SCHEMAS" = "--schemas" ]; then goflags+=(-schemas); tsflags+=(--schemas); fi
for i in $(seq 1 "$N"); do
  for mode in go ts-analyze; do
    case $mode in
      go) cmd=("$GO" "${goflags[@]}" "$P");;
      ts-analyze) cmd=(node "$HERE/ref-analyze.mjs" "$P" "$OUT/tmp.json" "${tsflags[@]}");;
    esac
    s=$(python3 -c 'import time;print(time.time())')
    /usr/bin/time -l "${cmd[@]}" >"$OUT/stdout" 2>"$OUT/stderr"
    e=$(python3 -c 'import time;print(time.time())')
    rss=$(awk '/maximum resident set size/{print $1}' "$OUT/stderr")
    info=$(grep -h '^{"files"' "$OUT/stderr" "$OUT/stdout" | tail -1)
    echo "$mode wall=$(python3 -c "print(round(($e-$s)*1000))")ms rss=$((rss / 1048576))MB $info"
  done
done
