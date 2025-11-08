import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { CommandSummary } from '../../utils/command-summary.js'

export const all: any = pikkuVoidFunc({
  func: async ({ logger, config, rpc, getInspectorState }) => {
    const summary = new CommandSummary('all')
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    await rpc.invoke('pikkuFunctionTypes', null)

    // This is needed since the wireHTTP function will add the routes to the visitState
    if (!typesDeclarationFileExists) {
      logger.debug(`• Type file first created, inspecting again...`)
      await getInspectorState(true)
    }

    // Generate wiring-specific type files for tree-shaking
    await rpc.invoke('pikkuFunctionTypesSplit', null)
    await rpc.invoke('pikkuHTTPTypes', null)
    await rpc.invoke('pikkuChannelTypes', null)
    await rpc.invoke('pikkuSchedulerTypes', null)
    await rpc.invoke('pikkuQueueTypes', null)
    await rpc.invoke('pikkuWorkflowTypes', null)
    await rpc.invoke('pikkuMCPTypes', null)
    await rpc.invoke('pikkuCLITypes', null)

    const hasFunctionRegistrations = await rpc.invoke('pikkuFunctions', null)

    // Generate and register middleware
    const middleware = await rpc.invoke('pikkuMiddleware', null)
    // Middleware must be imported before functions meta to ensure registration happens first
    if (middleware) {
      allImports.push(config.middlewareFile)
    }

    // Generate and register permissions
    const permissions = await rpc.invoke('pikkuPermissions', null)
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
    await rpc.invoke('pikkuServices', null)

    const hasInternalRPCs = await rpc.invoke('pikkuRPC', null)
    await rpc.invoke('pikkuRPCInternalMap', null)
    await rpc.invoke('pikkuRPCExposedMap', null)
    await rpc.invoke('pikkuRPCClient', null)

    if (hasInternalRPCs) {
      allImports.push(config.rpcInternalWiringMetaFile)
    }

    const schemas = await rpc.invoke('pikkuSchemas', null)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    // Generate HTTP
    const http = await rpc.invoke('pikkuHTTP', null)
    if (http) {
      await rpc.invoke('pikkuHTTPMap', null)
      await rpc.invoke('pikkuFetch', null)
      allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)
    }

    // Generate Scheduler
    const scheduler = await rpc.invoke('pikkuScheduler', null)
    if (scheduler) {
      allImports.push(
        config.schedulersWiringMetaFile,
        config.schedulersWiringFile
      )
    }

    // Generate Workflows
    const workflows = await rpc.invoke('pikkuWorkflow', null)
    if (workflows) {
      await rpc.invoke('pikkuWorkflowMap', null)
      allImports.push(
        config.workflowsWiringMetaFile,
        config.workflowsWiringFile
      )
    }

    // Generate Remote RPC Workers (must be before queue discovery so wireQueueWorker calls are picked up)
    const remoteRPC = await rpc.invoke('pikkuRemoteRPC', null)
    if (remoteRPC && config.rpc?.remoteRpcWorkersPath) {
      // Only add to imports if we actually generated the file
      allImports.push(config.rpc.remoteRpcWorkersPath)
    }

    // Reinspect to pick up generated workflow workers and remote RPC workers
    if (workflows || remoteRPC) {
      await getInspectorState(true)
    }

    // Generate Queues
    const queues = await rpc.invoke('pikkuQueue', null)
    if (queues) {
      await rpc.invoke('pikkuQueueMap', null)
      await rpc.invoke('pikkuQueueService', null)
      allImports.push(
        config.queueWorkersWiringMetaFile,
        config.queueWorkersWiringFile
      )
    }

    // Generate Channels
    const channels = await rpc.invoke('pikkuChannels', null)
    if (channels) {
      await rpc.invoke('pikkuChannelsMap', null)
      await rpc.invoke('pikkuWebSocketTyped', null)
      allImports.push(config.channelsWiringMetaFile, config.channelsWiringFile)
    }

    // Generate MCP
    const mcp = await rpc.invoke('pikkuMCP', null)
    if (mcp) {
      await rpc.invoke('pikkuMCPJSON', null)
      allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)
    }

    // Generate CLI
    const cli = await rpc.invoke('pikkuCLI', null)
    if (cli) {
      await rpc.invoke('pikkuCLIEntry', null)
      allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)
    }

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
      const totalCommands = Object.values(state.cli.meta).reduce(
        (sum, program) => sum + (program.commands?.length || 0),
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
