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

# The typed `m` namespace is compiled from messages/*.json into src/paraglide,
# which is gitignored and absent from the build artifact later jobs download.
# Any test touching a module that imports `m` would fail on a fresh checkout, so
# compile it here when it is missing. It is a local, offline compile of KB of
# JSON — a couple of seconds, and a no-op once present.
if [ ! -f "src/paraglide/messages.js" ]; then
  echo "Compiling paraglide messages (src/paraglide is generated and gitignored)"
  npx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
fi

# Define the pattern to match your test files
pattern="src/*.test.ts"

# Expand the pattern into an array of files
files=($(find src -type f -name "*.test.ts"))

# The theme contract is asserted against this app's sources but the test itself
# lives in @pikku/mantine, so it is named explicitly rather than found under src.
theme_contract="../../node_modules/@pikku/mantine/src/theme/theme-contract.test.ts"
if [ -f "$theme_contract" ]; then
  files+=("$theme_contract")
fi

# Check if any files matched the pattern
if [ ${#files[@]} -eq 0 ]; then
  echo "No test files found matching pattern: $pattern"
  exit 0
fi

# Construct the node command
node_cmd=(node --import tsx --test)

# Append options based on flags
if [ "$watch_mode" = true ]; then
  node_cmd+=(--watch)
fi

if [ "$coverage_mode" = true ]; then
  # Emit lcov to a file AND a human-readable spec report to stdout. Without the
  # second reporter, a coverage-mode failure sends everything to lcov.info and
  # leaves stdout empty, so CI shows only a non-zero exit with no test name —
  # an invisible failure. The paired reporters keep coverage while naming what broke.
  node_cmd+=(--test-coverage-include="src/**/*.{ts,tsx}" --test-coverage-exclude="**/dist/**" --test-coverage-exclude="src/paraglide/**" --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=lcov.info --test-reporter=spec --test-reporter-destination=stdout)
fi

# THEME_CONTRACT_ROOTS tells the shared contract test which sources to scan.
# Execute the node command with the expanded list of files
THEME_CONTRACT_ROOTS=src "${node_cmd[@]}" "${files[@]}"
