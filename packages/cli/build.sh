#!/bin/bash

set -e

echo "Starting Pikku CLI build process..."

# Clean .pikku directory and dist
rm -rf .pikku dist

# Bootstrap using the published CLI - generates all .pikku files
echo "Bootstrapping with published @pikku/cli..."
npx -y @pikku/cli@latest

# Build TypeScript
echo "Building TypeScript to dist..."
yarn tsc -b

# Copy generated .pikku files to dist (TypeScript doesn't copy .js files)
echo "Copying generated files to dist..."
cp -r .pikku dist/

# Copy schema file
echo "Copying schema file..."
cp .pikku/schemas/schemas/PikkuCLIConfig.schema.json cli.schema.json

echo "Build complete! ✓"
