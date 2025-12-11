import { existsSync } from 'fs'
import { pikkuVoidFunc } from '#pikku'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { CommandSummary } from '../../utils/command-summary.js'

export const all: any = pikkuVoidFunc({
  internal: true,
  func: async ({ logger, config, getInspectorState }, _data, { rpc }) => {
    const summary = new CommandSummary('all')
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    await rpc.invoke('pikkuFunctionTypes', null)

    if (!typesDeclarationFileExists) {
      logger.debug(`• Type file first created, inspecting again...`)
      await getInspectorState(true)
    }

    await rpc.invoke('pikkuFunctionTypesSplit', null)

    if (!config.externalPackage) {
      await rpc.invoke('pikkuHTTPTypes', null)
      await rpc.invoke('pikkuChannelTypes', null)
      await rpc.invoke('pikkuSchedulerTypes', null)
      await rpc.invoke('pikkuQueueTypes', null)
      await rpc.invoke('pikkuMCPTypes', null)
      await rpc.invoke('pikkuCLITypes', null)
    }

    const hasFunctionRegistrations = await rpc.invoke('pikkuFunctions', null)

    const middleware = await rpc.invoke('pikkuMiddleware', null)
    if (middleware) {
      allImports.push(config.middlewareFile)
    }

    const permissions = await rpc.invoke('pikkuPermissions', null)
    if (permissions) {
      allImports.push(config.permissionsFile)
    }

    allImports.push(config.functionsMetaFile)

    if (hasFunctionRegistrations) {
      allImports.push(config.functionsFile)
    }

    await rpc.invoke('pikkuServices', null)
    await rpc.invoke('pikkuServiceMetadata', null)

    const hasPackageFactories = await rpc.invoke('pikkuPackage', null)
    if (hasPackageFactories) {
      allImports.push(config.packageFile)
    }

    const hasInternalRPCs = await rpc.invoke('pikkuRPC', null)

    const schemas = await rpc.invoke('pikkuSchemas', null)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    await rpc.invoke('pikkuRPCInternalMap', null)
    await rpc.invoke('pikkuRPCExposedMap', null)
    await rpc.invoke('pikkuPublicRPC', null)
    await rpc.invoke('pikkuRPCClient', null)

    await rpc.invoke('pikkuForgeTypes', null)

    if (hasInternalRPCs) {
      allImports.push(config.rpcInternalWiringMetaFile)
    }

    if (!config.externalPackage) {
      const http = await rpc.invoke('pikkuHTTP', null)
      if (http) {
        await rpc.invoke('pikkuHTTPMap', null)
        await rpc.invoke('pikkuFetch', null)
        allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)
      }

      const scheduler = await rpc.invoke('pikkuScheduler', null)
      if (scheduler) {
        allImports.push(
          config.schedulersWiringMetaFile,
          config.schedulersWiringFile
        )
      }
    }

    const workflows = await rpc.invoke('pikkuWorkflow', null)

    let remoteRPC = false
    if (!config.externalPackage) {
      remoteRPC = await rpc.invoke('pikkuRemoteRPC', null)
    }

    if (workflows || remoteRPC) {
      await getInspectorState(true)
    }

    if (workflows) {
      allImports.push(config.workflowsWiringFile)
    }

    if (!config.externalPackage) {
      const queues = await rpc.invoke('pikkuQueue', null)
      if (queues) {
        await rpc.invoke('pikkuQueueMap', null)
        await rpc.invoke('pikkuQueueService', null)
        allImports.push(
          config.queueWorkersWiringMetaFile,
          config.queueWorkersWiringFile
        )
      }

      const channels = await rpc.invoke('pikkuChannels', null)
      if (channels) {
        await rpc.invoke('pikkuChannelsMap', null)
        await rpc.invoke('pikkuWebSocketTyped', null)
        allImports.push(
          config.channelsWiringMetaFile,
          config.channelsWiringFile
        )
      }

      const mcp = await rpc.invoke('pikkuMCP', null)
      if (mcp) {
        await rpc.invoke('pikkuMCPJSON', null)
        allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
      }

      const cli = await rpc.invoke('pikkuCLI', null)
      if (cli) {
        await rpc.invoke('pikkuCLIEntry', null)
        allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)
      }
    }

    await rpc.invoke('pikkuForgeNodes', null)

    if (config.nextBackendFile || config.nextHTTPFile) {
      await rpc.invoke('pikkuNext', null)
    }

    if (config.openAPI) {
      logger.debug(
        `• OpenAPI requires a reinspection to pickup new generated types..`
      )
      await getInspectorState(true)
      await rpc.invoke('pikkuOpenAPI', null)
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
