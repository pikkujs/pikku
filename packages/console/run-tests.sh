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

# The typed client under src/pikku is generated from backend/ the same way, and
# is gitignored for the same reason — so src/pikku/http.ts imports a module that
# is simply absent on a fresh checkout, and every test reaching it dies on
# ERR_MODULE_NOT_FOUND. `pikku all` is pure codegen: no network, no database, no
# server, a few seconds cold and skipped once the file is there.
#
# The CLI is invoked by path rather than through `npx`, because backend/ holds a
# pikku.config.json but no package.json: npx picks its own working directory
# from the nearest package root, so under CI's corepack shim it started the CLI
# somewhere above backend/ and the run died on `Config file pikku.config.json
# not found`. Running node directly keeps the cd we just did.
if [ ! -f "src/pikku/pikku-fetch.gen.ts" ]; then
  echo "Generating the console client (src/pikku/*.gen.ts is generated and gitignored)"
  (cd backend && node ../../cli/dist/bin/pikku.js all)
fi

# Define the pattern to match your test files
pattern="src/*.test.ts"

# Expand the pattern into an array of files
files=($(find src -type f -name "*.test.ts"))

# The theme contract is asserted against this app's sources but the test itself
# lives in @pikku/mantine, so it is named explicitly rather than found under src.
# The `./` prefix is load-bearing: bun reads a bare argument as a name filter and
# never searches node_modules, so without it the file is silently not run.
theme_contract="./node_modules/@pikku/mantine/src/theme/theme-contract.test.ts"
if [ -f "$theme_contract" ]; then
  files+=("$theme_contract")
fi

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

# THEME_CONTRACT_ROOTS tells the shared contract test which sources to scan.
# Execute the bun command with the expanded list of files
THEME_CONTRACT_ROOTS=src "${bun_cmd[@]}" "${files[@]}"
