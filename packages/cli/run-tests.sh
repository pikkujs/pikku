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
#
# --no-memory-protection-keys disables V8's PKU-based ThreadIsolation, which
# guards JIT pages on Linux x64. Its bookkeeping rarely loses track of a WASM
# code allocation and aborts the whole process mid-run:
#
#   Check failed: jit_page_->allocations_.erase(addr) == 1.
#
# db/local-db.test.ts opens a dozen PGlite instances, each compiling and freeing
# several MB of WASM, and is the file that trips it. The abort kills the test
# process outright, so it surfaces as a file that "failed" with every assertion
# in it green. Nothing here needs the hardening, and it is a V8 flag, so it has
# to be passed on the command line — NODE_OPTIONS rejects it.
node_cmd=(node --no-memory-protection-keys --import tsx --test)

# Append options based on flags
if [ "$watch_mode" = true ]; then
  node_cmd+=(--watch)
fi

if [ "$coverage_mode" = true ]; then
  # Emit lcov to a file AND a human-readable spec report to stdout. Without the
  # second reporter, a coverage-mode failure sends everything to lcov.info and
  # leaves stdout empty, so CI shows only a non-zero exit with no test name —
  # an invisible failure. The paired reporters keep coverage while naming what broke.
  node_cmd+=(--test-coverage-include="src/**/*.{ts,js}" --test-coverage-exclude="**/dist/**" --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=lcov.info --test-reporter=spec --test-reporter-destination=stdout)
fi

# Execute the node command with the expanded list of files
"${node_cmd[@]}" "${files[@]}"