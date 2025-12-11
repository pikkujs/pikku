#!/bin/bash

set -e

echo "Starting Pikku CLI build process..."

# Clean .pikku directory
rm -rf .pikku

# Create minimal bootstrap stub files (as .js for runtime)
echo "Creating minimal bootstrap stub files..."
mkdir -p .pikku/function .pikku/cli .pikku/rpc

cat > .pikku/pikku-types.gen.js << 'EOF'
/**
 * Bootstrap stub - minimal types for initial build
 */
export * from './function/pikku-function-types.gen.js'
export * from './cli/pikku-cli-types.gen.js'
EOF

cat > .pikku/function/pikku-function-types.gen.js << 'EOF'
/**
 * Bootstrap stub - minimal function types
 */
export const pikkuFunc = (func) => {
  return typeof func === 'function' ? { func } : func
}

export const pikkuSessionlessFunc = (func) => {
  return typeof func === 'function' ? { func } : func
}

export const pikkuVoidFunc = (func) => {
  return typeof func === 'function' ? { func } : func
}
EOF

cat > .pikku/cli/pikku-cli-types.gen.js << 'EOF'
/**
 * Bootstrap stub - minimal CLI types
 */
export { wireCLI } from '@pikku/core/cli'

export const pikkuCLICommand = (config) => {
  return config
}
EOF

cat > .pikku/rpc/pikku-rpc-wirings-meta.internal.gen.js << 'EOF'
/**
 * Bootstrap stub - RPC meta for initial build
 */
import { pikkuState } from '@pikku/core'
const rpcMeta = {
  all: 'all',
  watch: 'watch',
  bootstrap: 'bootstrap',
  pikkuFunctionTypes: 'pikkuFunctionTypes',
  pikkuFunctionTypesSplit: 'pikkuFunctionTypesSplit',
  pikkuHTTPTypes: 'pikkuHTTPTypes',
  pikkuChannelTypes: 'pikkuChannelTypes',
  pikkuSchedulerTypes: 'pikkuSchedulerTypes',
  pikkuQueueTypes: 'pikkuQueueTypes',
  pikkuMCPTypes: 'pikkuMCPTypes',
  pikkuCLITypes: 'pikkuCLITypes',
  pikkuFunctions: 'pikkuFunctions',
  pikkuMiddleware: 'pikkuMiddleware',
  pikkuPermissions: 'pikkuPermissions',
  pikkuServices: 'pikkuServices',
  pikkuServiceMetadata: 'pikkuServiceMetadata',
  pikkuPackage: 'pikkuPackage',
  pikkuRPC: 'pikkuRPC',
  pikkuSchemas: 'pikkuSchemas',
  pikkuRPCInternalMap: 'pikkuRPCInternalMap',
  pikkuRPCExposedMap: 'pikkuRPCExposedMap',
  pikkuPublicRPC: 'pikkuPublicRPC',
  pikkuRPCClient: 'pikkuRPCClient',
  pikkuForgeTypes: 'pikkuForgeTypes',
  pikkuHTTP: 'pikkuHTTP',
  pikkuHTTPMap: 'pikkuHTTPMap',
  pikkuFetch: 'pikkuFetch',
  pikkuScheduler: 'pikkuScheduler',
  pikkuWorkflow: 'pikkuWorkflow',
  pikkuRemoteRPC: 'pikkuRemoteRPC',
  pikkuQueue: 'pikkuQueue',
  pikkuQueueMap: 'pikkuQueueMap',
  pikkuQueueService: 'pikkuQueueService',
  pikkuChannels: 'pikkuChannels',
  pikkuChannelsMap: 'pikkuChannelsMap',
  pikkuWebSocketTyped: 'pikkuWebSocketTyped',
  pikkuMCP: 'pikkuMCP',
  pikkuMCPJSON: 'pikkuMCPJSON',
  pikkuCLI: 'pikkuCLI',
  pikkuCLIEntry: 'pikkuCLIEntry',
  pikkuForgeNodes: 'pikkuForgeNodes',
  pikkuNext: 'pikkuNext',
  pikkuOpenAPI: 'pikkuOpenAPI',
}
pikkuState(null, 'rpc', 'meta', rpcMeta)
EOF

cat > .pikku/pikku-bootstrap.gen.js << 'EOF'
/**
 * Bootstrap stub - imports RPC meta for initial build
 */
import './rpc/pikku-rpc-wirings-meta.internal.gen.js'
EOF

# Create .d.ts type declaration stubs for TypeScript
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

cat > .pikku/rpc/pikku-rpc-wirings-meta.internal.gen.d.ts << 'EOF'
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
