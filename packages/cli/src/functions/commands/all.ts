import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'

export const all: any = pikkuVoidFunc({
  func: async ({ logger, config, rpc, getInspectorState }) => {
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(config.typesDeclarationFile)) {
      typesDeclarationFileExists = false
    }

    await rpc.invoke('pikkuFunctionTypes', null)

    // This is needed since the wireHTTP function will add the routes to the visitState
    if (!typesDeclarationFileExists) {
      logger.info(`• Type file first created, inspecting again...\x1b[0m`)
      await getInspectorState(true)
    }

    // Generate wiring-specific type files for tree-shaking
    await rpc.invoke('pikkuFunctionTypesSplit', null)
    await rpc.invoke('pikkuHTTPTypes', null)
    await rpc.invoke('pikkuChannelTypes', null)
    await rpc.invoke('pikkuSchedulerTypes', null)
    await rpc.invoke('pikkuQueueTypes', null)
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
      logger.info(
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
  },
})
