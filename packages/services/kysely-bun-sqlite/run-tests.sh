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

files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(find src -type f -name "*.test.ts" -print0)

if [ ${#files[@]} -eq 0 ]; then
  echo "No test files found"
  exit 0
fi

if [ "$coverage_mode" = true ]; then
  # Bun writes coverage/lcov.info and instruments imported dist files too.
  # Re-emit a package-root lcov.info containing only src/ records so the
  # repo-wide unit-coverage merge — which expects <pkg>/lcov.info and prefixes
  # its SF paths — maps them correctly, exactly like the node packages'
  # --test-reporter=lcov output.
  bun test --coverage --coverage-reporter=lcov "${files[@]}"
  status=$?
  awk '/^SF:/{keep=/^SF:src\//} keep' coverage/lcov.info > lcov.info 2>/dev/null || true
  rm -rf coverage
  exit $status
fi

bun_cmd="bun test"

if [ "$watch_mode" = true ]; then
  bun_cmd="$bun_cmd --watch"
fi

$bun_cmd "${files[@]}"
