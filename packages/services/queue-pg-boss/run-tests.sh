#!/bin/bash
cd "$(dirname "$0")"
files=($(find src -type f -name "*.test.ts"))
if [ ${#files[@]} -eq 0 ]; then echo "No test files found"; exit 0; fi
node --import tsx --test "$@" "${files[@]}"
