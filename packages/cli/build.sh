#!/bin/bash
set -euo pipefail

echo "Starting Pikku CLI build process..."

# Clean .pikku directory and dist
test -f package.json || { echo "Refusing to run outside package root"; exit 1; }
rm -rf -- .pikku dist

# Bootstrap using the published CLI - generates all .pikku files
echo "Bootstrapping with published @pikku/cli..."
: "${PIKKU_CLI_VERSION:=latest}"
npx -y "@pikku/cli@${PIKKU_CLI_VERSION}"

# Build TypeScript
echo "Building TypeScript to dist..."
yarn tsc -b

# Build Pikku using the local CLI
yarn pikku
yarn tsc -b

# Copy schema file
echo "Copying schema file..."
cp .pikku/schemas/schemas/PikkuCLIConfig.schema.json cli.schema.json

echo "Build complete! ✓"
