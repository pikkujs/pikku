#!/bin/bash

# Enable nullglob to handle cases where no files match the pattern
shopt -s nullglob

# Initialize variables for options
watch_mode=false
coverage_mode=false

# Parse command-line options
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

# Define the pattern to match your test files
pattern="src/*.test.ts"

# Expand the pattern into an array of files
files=($(find src -type f -name "*.test.ts"))

# Check if any files matched the pattern
if [ ${#files[@]} -eq 0 ]; then
  echo "No test files found matching pattern: $pattern"
  exit 0
fi

# Construct the node command
node_cmd="node --import tsx --test"

# Append options based on flags
if [ "$watch_mode" = true ]; then
  node_cmd="$node_cmd --watch"
fi

if [ "$coverage_mode" = true ]; then
  node_cmd="$node_cmd --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=lcov.info"
fi

# Execute the node command with the expanded list of files
$node_cmd "${files[@]}"