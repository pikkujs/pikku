#!/bin/bash

shopt -s nullglob

watch_mode=false
coverage_mode=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --watch)
      watch_mode=true
      shift
      ;;
    --coverage)
      coverage_mode=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

files=($(find src -type f -name "*.test.ts"))

if [ ${#files[@]} -eq 0 ]; then
  echo "No test files found"
  exit 0
fi

bun_cmd="bun test"

if [ "$watch_mode" = true ]; then
  bun_cmd="$bun_cmd --watch"
fi

if [ "$coverage_mode" = true ]; then
  bun_cmd="$bun_cmd --coverage"
fi

$bun_cmd "${files[@]}"
