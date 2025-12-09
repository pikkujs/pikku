import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { CommandSummary } from '../../utils/command-summary.js'

import { pikkuFunctionTypes } from '../wirings/functions/pikku-command-function-types.js'
import { pikkuFunctionTypesSplit } from '../wirings/functions/pikku-command-function-types-split.js'
import { pikkuHTTPTypes } from '../wirings/http/pikku-command-http-types.js'
import { pikkuChannelTypes } from '../wirings/channels/pikku-command-channel-types.js'
import { pikkuSchedulerTypes } from '../wirings/scheduler/pikku-command-scheduler-types.js'
import { pikkuQueueTypes } from '../wirings/queue/pikku-command-queue-types.js'
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
import { pikkuPackage } from '../wirings/package/pikku-command-package.js'
import { pikkuForgeNodes } from '../wirings/forge/pikku-command-forge-nodes.js'
import { pikkuForgeTypes } from '../wirings/forge/pikku-command-forge-types.js'
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

    if (!typesDeclarationFileExists) {
      logger.debug(`• Type file first created, inspecting again...`)
      await getInspectorState(true)
    }

    await pikkuFunctionTypesSplit.func(services, null, wire)

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

    const middleware = await pikkuMiddleware.func(services, null, wire)
    if (middleware) {
      allImports.push(config.middlewareFile)
    }

    const permissions = await pikkuPermissions.func(services, null, wire)
    if (permissions) {
      allImports.push(config.permissionsFile)
    }

    allImports.push(config.functionsMetaFile)

    if (hasFunctionRegistrations) {
      allImports.push(config.functionsFile)
    }

    await pikkuServices.func(services, null, wire)
    await pikkuServiceMetadata.func(services, null, wire)

    const hasPackageFactories = await pikkuPackage.func(services, null, wire)
    if (hasPackageFactories) {
      allImports.push(config.packageFile)
    }

    const hasInternalRPCs = await pikkuRPC.func(services, null, wire)

    const schemas = await pikkuSchemas.func(services, null, wire)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    await pikkuRPCInternalMap.func(services, null, wire)
    await pikkuRPCExposedMap.func(services, null, wire)
    await pikkuPublicRPC.func(services, null, wire)
    await pikkuRPCClient.func(services, null, wire)

    await pikkuForgeTypes.func(services, null, wire)

    if (hasInternalRPCs) {
      allImports.push(config.rpcInternalWiringMetaFile)
    }

    if (!config.externalPackage) {
      const http = await pikkuHTTP.func(services, null, wire)
      if (http) {
        await pikkuHTTPMap.func(services, null, wire)
        await pikkuFetch.func(services, null, wire)
        allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)
      }

      const scheduler = await pikkuScheduler.func(services, null, wire)
      if (scheduler) {
        allImports.push(
          config.schedulersWiringMetaFile,
          config.schedulersWiringFile
        )
      }
    }

    const workflows = await pikkuWorkflow.func(services, null, wire)

    let remoteRPC = false
    if (!config.externalPackage) {
      remoteRPC = await pikkuRemoteRPC.func(services, null, wire)
    }

    if (workflows || remoteRPC) {
      await getInspectorState(true)
    }

    if (workflows) {
      allImports.push(config.workflowsWiringFile)
    }

    if (!config.externalPackage) {
      const queues = await pikkuQueue.func(services, null, wire)
      if (queues) {
        await pikkuQueueMap.func(services, null, wire)
        await pikkuQueueService.func(services, null, wire)
        allImports.push(
          config.queueWorkersWiringMetaFile,
          config.queueWorkersWiringFile
        )
      }

      const channels = await pikkuChannels.func(services, null, wire)
      if (channels) {
        await pikkuChannelsMap.func(services, null, wire)
        await pikkuWebSocketTyped.func(services, null, wire)
        allImports.push(
          config.channelsWiringMetaFile,
          config.channelsWiringFile
        )
      }

      const mcp = await pikkuMCP.func(services, null, wire)
      if (mcp) {
        await pikkuMCPJSON.func(services, null, wire)
        allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
      }

      const cli = await pikkuCLI.func(services, null, wire)
      if (cli) {
        await pikkuCLIEntry.func(services, null, wire)
        allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)
      }
    }

    await pikkuForgeNodes.func(services, null, wire)

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
    const externalPackageBootstraps: string[] = []
    const usedExternalPackages: Record<string, string> = {}
    if (
      config.externalPackages &&
      stateBeforeBootstrap.rpc?.usedExternalPackages?.size > 0
    ) {
      for (const namespace of stateBeforeBootstrap.rpc.usedExternalPackages) {
        const packageName = config.externalPackages[namespace]
        if (packageName) {
          const packageBootstrap = `${packageName}/.pikku/pikku-bootstrap.gen.js`
          externalPackageBootstraps.push(packageBootstrap)
          usedExternalPackages[namespace] = packageName
          logger.debug(
            `• External package detected: ${namespace} (${packageName})`
          )
        }
      }
    }

    const localImports = allImports.map(
      (to) =>
        `import '${getFileImportRelativePath(config.bootstrapFile, to, config.packageMappings)}'`
    )
    const externalImports = externalPackageBootstraps.map(
      (packagePath) => `import '${packagePath}'`
    )

    let externalPackagesRegistration = ''
    if (Object.keys(usedExternalPackages).length > 0) {
      externalPackagesRegistration = `
// Register external package mappings
import { pikkuState } from '@pikku/core'
const externalPackages = pikkuState(null, 'rpc', 'externalPackages')
${Object.entries(usedExternalPackages)
  .map(([ns, pkg]) => `externalPackages.set('${ns}', '${pkg}')`)
  .join('\n')}
`
    }

    const allBootstrapImports =
      [...localImports, ...externalImports]
        .sort((a, b) => {
          const aMeta = a.includes('meta')
          const bMeta = b.includes('meta')
          if (aMeta && !bMeta) return -1
          if (!aMeta && bMeta) return 1
          return 0
        })
        .join('\n') + externalPackagesRegistration

    await writeFileInDir(logger, config.bootstrapFile, allBootstrapImports)

    const state = await getInspectorState()
    if (state.http?.meta) {
      const httpRouteCount = (
        Object.values(state.http.meta) as Record<string, unknown>[]
      ).reduce((sum, routes) => sum + Object.keys(routes).length, 0)
      if (httpRouteCount > 0) summary.set('httpRoutes', httpRouteCount)
    }
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
      const totalCommands: number = Object.values(state.cli.meta).reduce(
        (sum: number, program: any) => sum + (program.commands?.length || 0),
        0
      )
      if (totalCommands > 0) summary.set('cliCommands', totalCommands)
    }
    if (state.workflows?.meta) {
      summary.set('workflows', Object.keys(state.workflows.meta).length)
    }
    if (state.forgeNodes?.meta) {
      const forgeNodesCount = Object.keys(state.forgeNodes.meta).length
      if (forgeNodesCount > 0) summary.set('forgeNodes', forgeNodesCount)
    }
    if (state.workflows?.graphMeta) {
      const workflowGraphsCount = Object.keys(state.workflows.graphMeta).length
      if (workflowGraphsCount > 0)
        summary.set('workflowGraphs', workflowGraphsCount)
    }

    if (!logger.isSilent()) {
      console.log(summary.format())
    }

    if (logger.hasCriticalErrors()) {
      process.exit(1)
    }
  },
})
