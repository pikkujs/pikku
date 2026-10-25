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
  if [ "${STRICT_TEST_DISCOVERY}" = "1" ]; then
    exit 1
  fi
  exit 0
fi

# Construct the bun command
#
# --parallel gives every test file its own worker process, which is what node's
# `--test` did. Several suites keep module-level caches (a TypeScript program, a
# temp fixture directory) that a shared process would leak between files.
#
# --timeout because bun caps a test at 5s by default where node had no cap, and
# the suites that build real TypeScript programs run well past that.
bun_cmd=(bun test --parallel --timeout 120000)

# Append options based on flags
if [ "$watch_mode" = true ]; then
  # --watch reruns in one process; parallel workers have nothing to watch.
  bun_cmd=(bun test --watch --timeout 120000)
fi

if [ "$coverage_mode" = true ]; then
  # --coverage-dir=. keeps lcov.info at the package root: CI merges every
  # package's report by prefixing its SF paths with the file's own directory,
  # so a nested coverage/ directory would re-root them one level too deep.
  bun_cmd+=(--coverage --coverage-reporter=lcov --coverage-reporter=text --coverage-dir=.)
  export PIKKU_TEST_COVERAGE=1
fi

# Fetch the mongod binary once, here, before the workers start. Each test file
# runs in its own `--parallel` worker and each calls MongoMemoryServer.create();
# on a cold cache (CI) two workers download the same binary at once and trip
# mongodb-memory-server's lockfile ("Cannot unlock file ... not locked by this
# process", then ENOENT renaming the .downloading file). With the binary already
# cached the workers only read it.
bun -e "import { MongoBinary } from 'mongodb-memory-server'; await MongoBinary.getPath()" || exit 1

# Execute the bun command with the expanded list of files
"${bun_cmd[@]}" "${files[@]}"
