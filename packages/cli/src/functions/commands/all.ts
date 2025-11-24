import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { CommandSummary } from '../../utils/command-summary.js'

// Import all command functions directly
import { pikkuFunctionTypes } from '../wirings/functions/pikku-command-function-types.js'
import { pikkuFunctionTypesSplit } from '../wirings/functions/pikku-command-function-types-split.js'
import { pikkuHTTPTypes } from '../wirings/http/pikku-command-http-types.js'
import { pikkuChannelTypes } from '../wirings/channels/pikku-command-channel-types.js'
import { pikkuSchedulerTypes } from '../wirings/scheduler/pikku-command-scheduler-types.js'
import { pikkuQueueTypes } from '../wirings/queue/pikku-command-queue-types.js'
import { pikkuWorkflowTypes } from '../wirings/workflow/pikku-command-workflow-types.js'
import { pikkuMCPTypes } from '../wirings/mcp/pikku-command-mcp-types.js'
import { pikkuCLITypes } from '../wirings/cli/pikku-command-cli-types.js'
import { pikkuFunctions } from '../wirings/functions/pikku-command-functions.js'
import { pikkuMiddleware } from '../wirings/middleware/pikku-command-middleware.js'
import { pikkuPermissions } from '../wirings/permissions/pikku-command-permissions.js'
import { pikkuServices } from '../wirings/functions/pikku-command-services.js'
import { pikkuServiceMetadata } from '../wirings/services/pikku-command-service-metadata.js'
import { pikkuRPC } from '../wirings/rpc/pikku-command-rpc.js'
import {
  pikkuRPCExposedMap,
  pikkuRPCInternalMap,
} from '../wirings/rpc/pikku-command-rpc-map.js'
import { pikkuPublicRPC } from '../wirings/rpc/pikku-command-public-rpc.js'
import { pikkuRPCClient } from '../wirings/rpc/pikku-command-rpc-client.js'
import { pikkuSchemas } from '../wirings/functions/schemas.js'
import { pikkuHTTP } from '../wirings/http/pikku-command-http-routes.js'
import { pikkuHTTPMap } from '../wirings/http/pikku-command-http-map.js'
import { pikkuFetch } from '../wirings/fetch/index.js'
import { pikkuScheduler } from '../wirings/scheduler/pikku-command-scheduler.js'
import { pikkuWorkflow } from '../wirings/workflow/pikku-command-workflow.js'
import { pikkuRemoteRPC } from '../wirings/rpc/pikku-command-remote-rpc.js'
import { pikkuWorkflowMap } from '../wirings/workflow/pikku-command-workflow-map.js'
import { pikkuQueue } from '../wirings/queue/pikku-command-queue.js'
import { pikkuQueueMap } from '../wirings/queue/pikku-command-queue-map.js'
import { pikkuQueueService } from '../wirings/queue/pikku-command-queue-service.js'
import { pikkuChannels } from '../wirings/channels/pikku-command-channels.js'
import { pikkuChannelsMap } from '../wirings/channels/pikku-command-channels-map.js'
import { pikkuWebSocketTyped } from '../wirings/channels/pikku-command-websocket-typed.js'
import { pikkuMCP } from '../wirings/mcp/pikku-command-mcp.js'
import { pikkuMCPJSON } from '../wirings/mcp/pikku-command-mcp-json.js'
import { pikkuCLI } from '../wirings/cli/pikku-command-cli.js'
import { pikkuCLIEntry } from '../wirings/cli/pikku-command-cli-entry.js'
import { pikkuNext } from '../runtimes/nextjs/pikku-command-nextjs.js'
import { pikkuOpenAPI } from '../wirings/http/pikku-command-openapi.js'
import { PikkuWire } from '@pikku/core'

export const all: any = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    const wire: PikkuWire = {}
    const services = { logger, config, getInspectorState }
    const summary = new CommandSummary('all')
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    await pikkuFunctionTypes.func(services, null, wire)

    // This is needed since the wireHTTP function will add the routes to the visitState
    if (!typesDeclarationFileExists) {
      logger.debug(`• Type file first created, inspecting again...`)
      await getInspectorState(true)
    }

    // Generate wiring-specific type files for tree-shaking
    await pikkuFunctionTypesSplit.func(services, null, wire)
    await pikkuWorkflowTypes.func(services, null, wire)

    // Skip infrastructure wirings for external packages (only keep functions, RPC, services, workflows)
    if (!config.externalPackage) {
      await pikkuHTTPTypes.func(services, null, wire)
      await pikkuChannelTypes.func(services, null, wire)
      await pikkuSchedulerTypes.func(services, null, wire)
      await pikkuQueueTypes.func(services, null, wire)
      await pikkuMCPTypes.func(services, null, wire)
      await pikkuCLITypes.func(services, null, wire)
    }

    const hasFunctionRegistrations = await pikkuFunctions.func(
      services,
      wire,
      null
    )

    // Generate and register middleware
    const middleware = await pikkuMiddleware.func(services, null, wire)
    // Middleware must be imported before functions meta to ensure registration happens first
    if (middleware) {
      allImports.push(config.middlewareFile)
    }

    // Generate and register permissions
    const permissions = await pikkuPermissions.func(services, null, wire)
    // Permissions must be imported before functions meta to ensure registration happens first
    if (permissions) {
      allImports.push(config.permissionsFile)
    }

    // Always import functions meta (needed for all function metadata)
    allImports.push(config.functionsMetaFile)

    // Only import functionsFile if it was generated (has internal/external RPCs)
    if (hasFunctionRegistrations) {
      allImports.push(config.functionsFile)
    }

    // Generate services map
    await pikkuServices.func(services, null, wire)

    // Generate service metadata JSON files for AI consumption
    await pikkuServiceMetadata.func(services, null, wire)

    const hasInternalRPCs = await pikkuRPC.func(services, null, wire)
    await pikkuRPCInternalMap.func(services, null, wire)
    await pikkuRPCExposedMap.func(services, null, wire)
    await pikkuPublicRPC.func(services, null, wire)
    await pikkuRPCClient.func(services, null, wire)

    if (hasInternalRPCs) {
      allImports.push(config.rpcInternalWiringMetaFile)
    }

    const schemas = await pikkuSchemas.func(services, null, wire)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    // Skip infrastructure wirings for external packages
    if (!config.externalPackage) {
      // Generate HTTP
      const http = await pikkuHTTP.func(services, null, wire)
      if (http) {
        await pikkuHTTPMap.func(services, null, wire)
        await pikkuFetch.func(services, null, wire)
        allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)
      }

      // Generate Scheduler
      const scheduler = await pikkuScheduler.func(services, null, wire)
      if (scheduler) {
        allImports.push(
          config.schedulersWiringMetaFile,
          config.schedulersWiringFile
        )
      }
    }

    // Generate Workflows
    const workflows = await pikkuWorkflow.func(services, null, wire)

    // Generate Remote RPC Workers (infrastructure - skip for external packages)
    let remoteRPC = false
    if (!config.externalPackage) {
      remoteRPC = await pikkuRemoteRPC.func(services, null, wire)
    }

    // Reinspect to pick up generated workflow workers and remote RPC workers BEFORE generating maps
    if (workflows || remoteRPC) {
      await getInspectorState(true)
    }

    if (workflows) {
      await pikkuWorkflowMap.func(services, null, wire)
      allImports.push(
        config.workflowsWiringMetaFile,
        config.workflowsWiringFile
      )
    }

    // Skip infrastructure wirings for external packages
    if (!config.externalPackage) {
      // Generate Queues
      const queues = await pikkuQueue.func(services, null, wire)
      if (queues) {
        await pikkuQueueMap.func(services, null, wire)
        await pikkuQueueService.func(services, null, wire)
        allImports.push(
          config.queueWorkersWiringMetaFile,
          config.queueWorkersWiringFile
        )
      }

      // Generate Channels
      const channels = await pikkuChannels.func(services, null, wire)
      if (channels) {
        await pikkuChannelsMap.func(services, null, wire)
        await pikkuWebSocketTyped.func(services, null, wire)
        allImports.push(
          config.channelsWiringMetaFile,
          config.channelsWiringFile
        )
      }

      // Generate MCP
      const mcp = await pikkuMCP.func(services, null, wire)
      if (mcp) {
        await pikkuMCPJSON.func(services, null, wire)
        allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
      }

      // Generate CLI
      const cli = await pikkuCLI.func(services, null, wire)
      if (cli) {
        await pikkuCLIEntry.func(services, null, wire)
        allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)
      }
    }

    if (config.nextBackendFile || config.nextHTTPFile) {
      await pikkuNext.func(services, null, wire)
    }

    if (config.openAPI) {
      logger.debug(
        `• OpenAPI requires a reinspection to pickup new generated types..`
      )
      await getInspectorState(true)
      await pikkuOpenAPI.func(services, null, wire)
    }

    const stateBeforeBootstrap = await getInspectorState()
    if (
      config.externalPackages &&
      stateBeforeBootstrap.rpc?.usedExternalPackages?.size > 0
    ) {
      for (const namespace of stateBeforeBootstrap.rpc.usedExternalPackages) {
        const packageName = config.externalPackages[namespace]
        if (packageName) {
          const packageBootstrap = `${packageName}/.pikku/pikku-bootstrap.gen.js`
          allImports.push(packageBootstrap)
          logger.debug(
            `• External package detected: ${namespace} (${packageName})`
          )
        }
      }
    }

    // Generate main bootstrap file (pass all imports directly since this is the main file)
    await writeFileInDir(
      logger,
      config.bootstrapFile,
      allImports
        .map(
          (to) =>
            `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
        )
        .sort((to) => (to.includes('meta') ? -1 : 1)) // Ensure meta files are at the top
        .join('\n')
    )

    // Get final inspector state and collect stats for summary
    const state = await getInspectorState()
    if (state.http?.meta)
      summary.set('httpRoutes', Object.keys(state.http.meta).length)
    if (state.channels?.meta)
      summary.set('channels', Object.keys(state.channels.meta).length)
    if (state.scheduledTasks?.meta)
      summary.set(
        'scheduledTasks',
        Object.keys(state.scheduledTasks.meta).length
      )
    if (state.queueWorkers?.meta)
      summary.set('queueWorkers', Object.keys(state.queueWorkers.meta).length)
    if (state.mcpEndpoints) {
      const mcpTotal =
        Object.keys(state.mcpEndpoints.toolsMeta || {}).length +
        Object.keys(state.mcpEndpoints.resourcesMeta || {}).length +
        Object.keys(state.mcpEndpoints.promptsMeta || {}).length
      if (mcpTotal > 0) summary.set('mcpEndpoints', mcpTotal)
    }
    if (state.cli?.meta) {
      // Count total CLI commands across all programs
      const totalCommands: number = Object.values(state.cli.meta).reduce(
        (sum: number, program: any) => sum + (program.commands?.length || 0),
        0
      )
      if (totalCommands > 0) summary.set('cliCommands', totalCommands)
    }
    if (state.workflows?.meta) {
      summary.set('workflows', Object.keys(state.workflows.meta).length)
    }

    // Display summary (unless in silent mode)
    if (!logger.isSilent()) {
      console.log(summary.format())
    }

    // Check for critical errors and exit if any were logged
    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
