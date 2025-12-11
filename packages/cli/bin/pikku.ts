#!/usr/bin/env node
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Command } from 'commander'
import { createConfig, createSingletonServices } from '../src/services.js'
import { LocalVariablesService } from '@pikku/core/services'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Try to use the generated Pikku CLI first
const pikkuCliPath = join(__dirname, '../.pikku/cli/pikku-cli.gen.js')

if (existsSync(pikkuCliPath)) {
  try {
    const { PikkuCLI } = await import(pikkuCliPath)
    await PikkuCLI(process.argv.slice(2))
    process.exit(0)
  } catch (error: any) {
    console.warn(
      'Failed to load Pikku CLI, using fallback mode:',
      error.message
    )
  }
}

// Fallback to commander.js for bootstrap mode
import '../.pikku/pikku-bootstrap.gen.js'

// Import command functions for bootstrap
import { all as allCommand } from '../src/functions/commands/all.js'
import { watch as watchCommand } from '../src/functions/commands/watch.js'

// Import all wiring functions for bootstrap RPC
import { pikkuFunctionTypes } from '../src/functions/wirings/functions/pikku-command-function-types.js'
import { pikkuFunctionTypesSplit } from '../src/functions/wirings/functions/pikku-command-function-types-split.js'
import { pikkuHTTPTypes } from '../src/functions/wirings/http/pikku-command-http-types.js'
import { pikkuChannelTypes } from '../src/functions/wirings/channels/pikku-command-channel-types.js'
import { pikkuSchedulerTypes } from '../src/functions/wirings/scheduler/pikku-command-scheduler-types.js'
import { pikkuQueueTypes } from '../src/functions/wirings/queue/pikku-command-queue-types.js'
import { pikkuMCPTypes } from '../src/functions/wirings/mcp/pikku-command-mcp-types.js'
import { pikkuCLITypes } from '../src/functions/wirings/cli/pikku-command-cli-types.js'
import { pikkuFunctions } from '../src/functions/wirings/functions/pikku-command-functions.js'
import { pikkuMiddleware } from '../src/functions/wirings/middleware/pikku-command-middleware.js'
import { pikkuPermissions } from '../src/functions/wirings/permissions/pikku-command-permissions.js'
import { pikkuServices } from '../src/functions/wirings/functions/pikku-command-services.js'
import { pikkuServiceMetadata } from '../src/functions/wirings/services/pikku-command-service-metadata.js'
import { pikkuRPC } from '../src/functions/wirings/rpc/pikku-command-rpc.js'
import {
  pikkuRPCExposedMap,
  pikkuRPCInternalMap,
} from '../src/functions/wirings/rpc/pikku-command-rpc-map.js'
import { pikkuPublicRPC } from '../src/functions/wirings/rpc/pikku-command-public-rpc.js'
import { pikkuRPCClient } from '../src/functions/wirings/rpc/pikku-command-rpc-client.js'
import { pikkuSchemas } from '../src/functions/wirings/functions/schemas.js'
import { pikkuHTTP } from '../src/functions/wirings/http/pikku-command-http-routes.js'
import { pikkuHTTPMap } from '../src/functions/wirings/http/pikku-command-http-map.js'
import { pikkuFetch } from '../src/functions/wirings/fetch/index.js'
import { pikkuScheduler } from '../src/functions/wirings/scheduler/pikku-command-scheduler.js'
import { pikkuWorkflow } from '../src/functions/wirings/workflow/pikku-command-workflow.js'
import { pikkuRemoteRPC } from '../src/functions/wirings/rpc/pikku-command-remote-rpc.js'
import { pikkuQueue } from '../src/functions/wirings/queue/pikku-command-queue.js'
import { pikkuQueueMap } from '../src/functions/wirings/queue/pikku-command-queue-map.js'
import { pikkuQueueService } from '../src/functions/wirings/queue/pikku-command-queue-service.js'
import { pikkuChannels } from '../src/functions/wirings/channels/pikku-command-channels.js'
import { pikkuChannelsMap } from '../src/functions/wirings/channels/pikku-command-channels-map.js'
import { pikkuWebSocketTyped } from '../src/functions/wirings/channels/pikku-command-websocket-typed.js'
import { pikkuMCP } from '../src/functions/wirings/mcp/pikku-command-mcp.js'
import { pikkuMCPJSON } from '../src/functions/wirings/mcp/pikku-command-mcp-json.js'
import { pikkuCLI } from '../src/functions/wirings/cli/pikku-command-cli.js'
import { pikkuCLIEntry } from '../src/functions/wirings/cli/pikku-command-cli-entry.js'
import { pikkuNext } from '../src/functions/runtimes/nextjs/pikku-command-nextjs.js'
import { pikkuOpenAPI } from '../src/functions/wirings/http/pikku-command-openapi.js'
import { pikkuPackage } from '../src/functions/wirings/package/pikku-command-package.js'
import { pikkuForgeNodes } from '../src/functions/wirings/forge/pikku-command-forge-nodes.js'
import { pikkuForgeTypes } from '../src/functions/wirings/forge/pikku-command-forge-types.js'

// Bootstrap RPC function map - maps RPC names to function implementations
const bootstrapFunctionMap: Record<string, any> = {
  all: allCommand,
  watch: watchCommand,
  pikkuFunctionTypes,
  pikkuFunctionTypesSplit,
  pikkuHTTPTypes,
  pikkuChannelTypes,
  pikkuSchedulerTypes,
  pikkuQueueTypes,
  pikkuMCPTypes,
  pikkuCLITypes,
  pikkuFunctions,
  pikkuMiddleware,
  pikkuPermissions,
  pikkuServices,
  pikkuServiceMetadata,
  pikkuRPC,
  pikkuRPCInternalMap,
  pikkuRPCExposedMap,
  pikkuPublicRPC,
  pikkuRPCClient,
  pikkuSchemas,
  pikkuHTTP,
  pikkuHTTPMap,
  pikkuFetch,
  pikkuScheduler,
  pikkuWorkflow,
  pikkuRemoteRPC,
  pikkuQueue,
  pikkuQueueMap,
  pikkuQueueService,
  pikkuChannels,
  pikkuChannelsMap,
  pikkuWebSocketTyped,
  pikkuMCP,
  pikkuMCPJSON,
  pikkuCLI,
  pikkuCLIEntry,
  pikkuNext,
  pikkuOpenAPI,
  pikkuPackage,
  pikkuForgeNodes,
  pikkuForgeTypes,
}

// Create a bootstrap RPC that can invoke functions directly
const createBootstrapRPC = (services: any) => {
  const bootstrapRPC = {
    invoke: async (name: string, data: any) => {
      const fn = bootstrapFunctionMap[name]
      if (!fn) {
        throw new Error(`Bootstrap RPC function not found: ${name}`)
      }
      return fn.func(services, data, { rpc: bootstrapRPC })
    },
  }
  return bootstrapRPC
}

const action = async (command: string, cliConfig: any) => {
  const config = await createConfig(new LocalVariablesService(), cliConfig)
  const services = await createSingletonServices(config)
  const rpc = createBootstrapRPC(services)

  if (command === 'watch') {
    await rpc.invoke('watch', null)
  } else {
    await rpc.invoke('all', null)
  }
}

const setupCommand = (program: any, name: string, description: string) => {
  program
    .command(name, { isDefault: name === 'all' })
    .description(description)
    .option('--pikku-config-type', 'The type of your pikku config object')
    .option(
      '--singleton-services-factory-type',
      'The type of your singleton services factory'
    )
    .option(
      '--session-services-factory-type',
      'The type of your wire services factory'
    )
    .option('-c, --config <string>', 'The path to pikku cli config file')
    .option('-t, --tags <tags...>', 'Which tags to filter by')
    .option(
      '--types <types...>',
      'Which types to filter by (http, channel, queue, scheduler, rpc, mcp)'
    )
    .option(
      '-d, --directories <directories...>',
      'Which directories to filter by'
    )
    .option(
      '-n, --names <names...>',
      'Filter functions by name patterns (supports wildcards)'
    )
    .option(
      '--httpMethods <methods...>',
      'Filter HTTP routes by methods (comma-separated)'
    )
    .option(
      '--httpRoutes <routes...>',
      'Filter HTTP routes by route patterns (comma-separated)'
    )
    .option('-s, --silent', 'Silent mode - only show critical errors')
    .option(
      '--info',
      'Show info messages and above (info, warn, error, critical)'
    )
    .option('--verbose', 'Show all debug messages (most detailed)')
    .option(
      '--loglevel <level>',
      'Set explicit log level (trace, debug, info, warn, error, critical)'
    )
    .option(
      '--state-output <path>',
      'Save inspector state to JSON file for reuse'
    )
    .option(
      '--state-input <path>',
      'Load inspector state from JSON file (skips inspection)'
    )
    .action((c: any) => action(name, c))
}

const program = new Command('pikku')
program.usage('[command]')

setupCommand(program, 'all', 'Generate all pikku wirings and files')
setupCommand(program, 'watch', 'Watch for changes and regenerate')

program.parse(process.argv)
