import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { generateBootstrapFile } from '../../utils/generate-bootstrap-file.js'

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

    const functions = await rpc.invoke('pikkuFunctions', null)
    if (!functions) {
      logger.info(`• No functions found, skipping remaining steps...\x1b[0m`)
      process.exit(1)
    }

    // Base imports for all bootstrap files
    allImports.push(config.functionsMetaFile, config.functionsFile)

    // Generate services map
    await rpc.invoke('pikkuServices', null)

    await rpc.invoke('pikkuRPC', null)
    await rpc.invoke('pikkuRPCInternalMap', null)
    await rpc.invoke('pikkuRPCExposedMap', null)
    await rpc.invoke('pikkuRPCClient', null)

    allImports.push(config.rpcInternalWiringMetaFile)

    const schemas = await rpc.invoke('pikkuSchemas', null)
    if (schemas) {
      allImports.push(`${config.schemaDirectory}/register.gen.ts`)
    }

    // RPC bootstrap is always generated since RPC is always present
    // Include the internal meta file
    await generateBootstrapFile(
      logger,
      config,
      config.bootstrapFiles.rpc,
      [config.rpcInternalWiringMetaFile],
      schemas
    )

    const http = await rpc.invoke('pikkuHTTP', null)
    if (http) {
      await rpc.invoke('pikkuHTTPMap', null)
      await rpc.invoke('pikkuFetch', null)
      allImports.push(config.httpWiringMetaFile, config.httpWiringsFile)

      await generateBootstrapFile(
        logger,
        config,
        config.bootstrapFiles.http,
        [config.httpWiringMetaFile, config.httpWiringsFile],
        schemas
      )
    }

    const scheduler = await rpc.invoke('pikkuScheduler', null)
    if (scheduler) {
      allImports.push(
        config.schedulersWiringMetaFile,
        config.schedulersWiringFile
      )

      await generateBootstrapFile(
        logger,
        config,
        config.bootstrapFiles.scheduler,
        [config.schedulersWiringMetaFile, config.schedulersWiringFile],
        schemas
      )
    }

    const queues = await rpc.invoke('pikkuQueue', null)
    if (queues) {
      await rpc.invoke('pikkuQueueMap', null)
      await rpc.invoke('pikkuQueueService', null)
      allImports.push(
        config.queueWorkersWiringMetaFile,
        config.queueWorkersWiringFile
      )

      await generateBootstrapFile(
        logger,
        config,
        config.bootstrapFiles.queue,
        [config.queueWorkersWiringMetaFile, config.queueWorkersWiringFile],
        schemas
      )
    }

    const channels = await rpc.invoke('pikkuChannels', null)
    if (channels) {
      await rpc.invoke('pikkuChannelsMap', null)
      await rpc.invoke('pikkuWebSocketTyped', null)
      allImports.push(config.channelsWiringMetaFile, config.channelsWiringFile)

      await generateBootstrapFile(
        logger,
        config,
        config.bootstrapFiles.channel,
        [config.channelsWiringMetaFile, config.channelsWiringFile],
        schemas
      )
    }

    const mcp = await rpc.invoke('pikkuMCP', null)
    if (mcp) {
      await rpc.invoke('pikkuMCPJSON', null)
      allImports.push(config.mcpWiringsMetaFile, config.mcpWiringsFile)

      await generateBootstrapFile(
        logger,
        config,
        config.bootstrapFiles.mcp,
        [config.mcpWiringsMetaFile, config.mcpWiringsFile],
        schemas
      )
    }

    const cli = await rpc.invoke('pikkuCLI', null)
    if (cli) {
      await rpc.invoke('pikkuCLIBootstrap', null)
      allImports.push(config.cliWiringMetaFile, config.cliWiringsFile)

      await generateBootstrapFile(
        logger,
        config,
        config.bootstrapFiles.cli,
        [config.cliWiringMetaFile, config.cliWiringsFile],
        schemas
      )
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
