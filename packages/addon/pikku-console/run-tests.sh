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

node_cmd="node --import tsx --test"

if [ "$watch_mode" = true ]; then
  node_cmd="$node_cmd --watch"
fi

if [ "$coverage_mode" = true ]; then
  node_cmd="$node_cmd --test-coverage-include=\"src/**/*.{ts,js}\" --test-coverage-exclude=\"**/dist/**\" --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=lcov.info"
fi

$node_cmd "${files[@]}"
