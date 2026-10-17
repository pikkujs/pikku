#!/bin/sh
# Regenerates codes.gen.go from the TS ErrorCode enum. Run via `go generate`.
set -e
src=../../../inspector/src/error-codes.ts
{
echo "// Code generated from packages/inspector/src/error-codes.ts by"
echo "// \`go generate ./internal/diag\`. DO NOT EDIT."
echo
echo "package diag"
echo
echo "const ("
grep -E "^\s+[A-Z_0-9]+ = 'PKU[0-9]+'," "$src" | sed -E "s/^ *([A-Z_0-9]+) = '(PKU[0-9]+)',/\1 \2/" | while read n c; do
  go_name=$(echo "$n" | awk -F_ '{for(i=1;i<=NF;i++){printf "%s%s", substr($i,1,1), tolower(substr($i,2))}}')
  echo "	${go_name} Code = \"${c}\""
done
echo ")"
} > codes.gen.go
gofmt -w codes.gen.go
