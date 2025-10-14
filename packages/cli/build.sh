#!/bin/bash

# Exit on error
set -e

echo "Starting Pikku CLI build process..."

# Step 1: Clean the dist directory
# Remove any previously built files to ensure a fresh build
# echo "Cleaning dist directory..."
rm -rf .pikku/cli

# Step 2: Generate types using the published version of @pikku/cli
# We use the latest published version from npm to generate Pikku types because
# the CLI package needs its own generated types to build itself (bootstrap problem).
# This relies on the published version being backwards compatible enough to generate
# types that work with the current codebase.
echo "Generating Pikku types using published @pikku/cli..."
npx -y @pikku/cli@latest

# Step 3: Build the TypeScript source to dist
# Now that we have the generated types (from the published version),
# we can compile the TypeScript source code
echo "Building TypeScript to dist..."
yarn tsc -b

# Step 4: Remove the generated .pikku directory
# The types we generated in step 2 were from the old published version.
# We need to regenerate them with the newly built local version to ensure
# the generated files reflect the actual current state of the CLI.
echo "Removing .pikku directory (generated from published version)..."
rm -rf .pikku

# Step 5: Regenerate types using the newly built local CLI
# Use the freshly built local version (from dist) to regenerate Pikku types.
# This ensures the generated files are in sync with the current codebase.
echo "Regenerating Pikku types using local CLI..."
yarn pikku

# Step 6: Rebuild to reflect the actual state
# Compile again now that we have the correct generated types from the local version.
# This ensures the final dist reflects the true current state of both the source
# and the generated type files.
echo "Rebuilding TypeScript with local types..."
yarn tsc -b

# Step 7: Copy the generated schema to cli.schema.json
# The schema is generated as part of the Pikku type generation process
# and needs to be copied to the root of the package for distribution
echo "Copying schema file..."
cp .pikku/schemas/schemas/PikkuCLIConfig.schema.json cli.schema.json

echo "Build complete! ✓"
