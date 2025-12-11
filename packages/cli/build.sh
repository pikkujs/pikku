#!/bin/bash

set -e

echo "Starting Pikku CLI build process..."

# Clean .pikku directory
rm -rf .pikku

# Create minimal bootstrap stub files
echo "Creating minimal bootstrap stub files..."
mkdir -p .pikku/function .pikku/cli .pikku/rpc .pikku/http .pikku/scheduler .pikku/queue .pikku/channel .pikku/mcp .pikku/schemas

# Function types stub
cat > .pikku/pikku-types.gen.js << 'EOF'
export * from './function/pikku-function-types.gen.js'
export * from './cli/pikku-cli-types.gen.js'
EOF

cat > .pikku/function/pikku-function-types.gen.js << 'EOF'
export const pikkuFunc = (func) => typeof func === 'function' ? { func } : func
export const pikkuSessionlessFunc = (func) => typeof func === 'function' ? { func } : func
export const pikkuVoidFunc = (func) => typeof func === 'function' ? { func } : func
EOF

cat > .pikku/cli/pikku-cli-types.gen.js << 'EOF'
export { wireCLI } from '@pikku/core/cli'
export const pikkuCLICommand = (config) => config
EOF

# CLI metadata JSON - minimal commands needed for bootstrap
cat > .pikku/cli/pikku-cli-wirings-meta.gen.json << 'EOF'
{
  "programs": {
    "pikku": {
      "program": "pikku",
      "commands": {
        "all": {
          "pikkuFuncName": "all",
          "positionals": [],
          "options": {},
          "description": "Generate all Pikku files",
          "isDefault": true
        },
        "bootstrap": {
          "pikkuFuncName": "bootstrap",
          "positionals": [],
          "options": {},
          "description": "Generate only type files"
        },
        "watch": {
          "pikkuFuncName": "watch",
          "positionals": [],
          "options": {},
          "description": "Watch for file changes"
        }
      },
      "options": {}
    }
  },
  "renderers": {}
}
EOF

# CLI metadata registration
cat > .pikku/cli/pikku-cli-wirings-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
import metaData from './pikku-cli-wirings-meta.gen.json' with { type: 'json' }
pikkuState(null, 'cli', 'meta', metaData)
EOF

# CLI wirings - imports the actual cli.wiring.ts
cat > .pikku/cli/pikku-cli-wirings.gen.js << 'EOF'
import '../../src/cli.wiring.js'
EOF

# CLI entry point
cat > .pikku/cli/pikku-cli.gen.js << 'EOF'
import { executeCLI, CLIError } from '@pikku/core/cli'
import { createConfig, createSingletonServices, createWireServices } from '../../src/services.js'
import '../pikku-bootstrap.gen.js'

export async function PikkuCLI(args) {
  try {
    await executeCLI({
      programName: 'pikku',
      args: args || process.argv.slice(2),
      createConfig,
      createSingletonServices,
      createWireServices,
    })
  } catch (error) {
    if (error instanceof CLIError) {
      process.exit(error.exitCode)
    }
    throw error
  }
}

export default PikkuCLI
EOF

# Empty stubs for other wiring types
cat > .pikku/function/pikku-functions-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'function', 'meta', {})
EOF

cat > .pikku/function/pikku-functions.gen.js << 'EOF'
// Functions will be registered via cli.wiring.ts
EOF

cat > .pikku/rpc/pikku-rpc-wirings-meta.internal.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'rpc', 'meta', {})
EOF

cat > .pikku/http/pikku-http-wirings-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'http', 'meta', {})
EOF

cat > .pikku/http/pikku-http-wirings.gen.js << 'EOF'
// No HTTP wirings for CLI
EOF

cat > .pikku/scheduler/pikku-schedulers-wirings-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'scheduledTasks', 'meta', {})
EOF

cat > .pikku/scheduler/pikku-schedulers-wirings.gen.js << 'EOF'
// No scheduler wirings for CLI
EOF

cat > .pikku/queue/pikku-queue-workers-wirings-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'queueWorkers', 'meta', {})
EOF

cat > .pikku/queue/pikku-queue-workers-wirings.gen.js << 'EOF'
// No queue wirings for CLI
EOF

cat > .pikku/channel/pikku-channels-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'channels', 'meta', {})
EOF

cat > .pikku/channel/pikku-channels.gen.js << 'EOF'
// No channel wirings for CLI
EOF

cat > .pikku/mcp/pikku-mcp-wirings-meta.gen.js << 'EOF'
import { pikkuState } from '@pikku/core'
pikkuState(null, 'mcpEndpoints', { toolsMeta: {}, resourcesMeta: {}, promptsMeta: {} })
EOF

cat > .pikku/mcp/pikku-mcp-wirings.gen.js << 'EOF'
// No MCP wirings for CLI
EOF

cat > .pikku/schemas/register.gen.js << 'EOF'
// No schemas to register during bootstrap
EOF

# Bootstrap file - imports all meta files then wirings
cat > .pikku/pikku-bootstrap.gen.js << 'EOF'
import './function/pikku-functions-meta.gen.js'
import './rpc/pikku-rpc-wirings-meta.internal.gen.js'
import './http/pikku-http-wirings-meta.gen.js'
import './scheduler/pikku-schedulers-wirings-meta.gen.js'
import './queue/pikku-queue-workers-wirings-meta.gen.js'
import './channel/pikku-channels-meta.gen.js'
import './mcp/pikku-mcp-wirings-meta.gen.js'
import './cli/pikku-cli-wirings-meta.gen.js'
import './function/pikku-functions.gen.js'
import './schemas/register.gen.js'
import './http/pikku-http-wirings.gen.js'
import './scheduler/pikku-schedulers-wirings.gen.js'
import './queue/pikku-queue-workers-wirings.gen.js'
import './channel/pikku-channels.gen.js'
import './mcp/pikku-mcp-wirings.gen.js'
import './cli/pikku-cli-wirings.gen.js'
EOF

# Type declaration stubs
cat > .pikku/pikku-types.gen.d.ts << 'EOF'
export * from './function/pikku-function-types.gen.js'
export * from './cli/pikku-cli-types.gen.js'
EOF

cat > .pikku/function/pikku-function-types.gen.d.ts << 'EOF'
export declare const pikkuFunc: <In, Out = unknown>(func: any) => any
export declare const pikkuSessionlessFunc: <In, Out = unknown>(func: any) => any
export declare const pikkuVoidFunc: (func: any) => any
EOF

cat > .pikku/cli/pikku-cli-types.gen.d.ts << 'EOF'
export { wireCLI } from '@pikku/core/cli'
export declare const pikkuCLICommand: (config: any) => any
EOF

cat > .pikku/pikku-bootstrap.gen.d.ts << 'EOF'
export {}
EOF

# Build TypeScript with stubs
echo "Building TypeScript to dist..."
yarn tsc -b

# Regenerate types with newly built CLI (overwrites stubs)
echo "Regenerating Pikku types using local CLI..."
yarn pikku

# Rebuild with generated types
echo "Rebuilding TypeScript with local types..."
yarn tsc -b

# Copy schema file
echo "Copying schema file..."
cp .pikku/schemas/schemas/PikkuCLIConfig.schema.json cli.schema.json

echo "Build complete! ✓"
