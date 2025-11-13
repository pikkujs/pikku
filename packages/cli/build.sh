#!/bin/bash

set -e

echo "Starting Pikku CLI build process..."

# Clean .pikku directory
rm -rf .pikku

# Create minimal bootstrap stub files
echo "Creating minimal bootstrap stub files..."
mkdir -p .pikku/function .pikku/cli

cat > .pikku/pikku-types.gen.ts << 'EOF'
/**
 * Bootstrap stub - minimal types for initial build
 */
export * from './function/pikku-function-types.gen.js'
export * from './cli/pikku-cli-types.gen.js'
EOF

cat > .pikku/function/pikku-function-types.gen.ts << 'EOF'
/**
 * Bootstrap stub - minimal function types
 */
export const pikkuFunc = <In, Out = unknown>(func: any) => {
  return typeof func === 'function' ? { func } : func
}

export const pikkuSessionlessFunc = <In, Out = unknown>(func: any) => {
  return typeof func === 'function' ? { func } : func
}

export const pikkuVoidFunc = (func: any) => {
  return typeof func === 'function' ? { func } : func
}
EOF

cat > .pikku/cli/pikku-cli-types.gen.ts << 'EOF'
/**
 * Bootstrap stub - minimal CLI types
 */
export { wireCLI } from '@pikku/core/cli'

export const pikkuCLICommand = (config: any) => {
  return config
}
EOF

cat > .pikku/pikku-bootstrap.gen.ts << 'EOF'
/**
 * Bootstrap stub - empty bootstrap file
 */
EOF

# Build TypeScript with stubs
echo "Building TypeScript to dist..."
yarn tsc -b

# Regenerate types with newly built CLI
echo "Removing .pikku directory (generated from published version)..."
rm -rf .pikku

echo "Regenerating Pikku types using local CLI..."
yarn pikku

# Rebuild with generated types
echo "Rebuilding TypeScript with local types..."
yarn tsc -b

# Copy schema file
echo "Copying schema file..."
cp .pikku/schemas/schemas/PikkuCLIConfig.schema.json cli.schema.json

echo "Build complete! ✓"
