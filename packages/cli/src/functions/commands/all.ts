import { existsSync } from 'fs'
import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import { getFileImportRelativePath } from '../../utils/file-import-path.js'
import { writeFileInDir } from '../../utils/file-writer.js'
import { generateBootstrapFile } from '../../utils/generate-bootstrap-file.js'

export const all: any = pikkuVoidFunc({
  func: async ({ logger, cliConfig, rpc, getInspectorState }) => {
    const allImports: string[] = []
    let typesDeclarationFileExists = true

    if (!existsSync(cliConfig.typesDeclarationFile)) {
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
    allImports.push(cliConfig.functionsMetaFile, cliConfig.functionsFile)

    // Generate services map
    await rpc.invoke('pikkuServices', null)

    await rpc.invoke('pikkuRPC', null)
    await rpc.invoke('pikkuRPCInternalMap', null)
    await rpc.invoke('pikkuRPCExposedMap', null)
    await rpc.invoke('pikkuRPCClient', null)

    allImports.push(cliConfig.rpcInternalWiringMetaFile)

    const schemas = await rpc.invoke('pikkuSchemas', null)
    if (schemas) {
      allImports.push(`${cliConfig.schemaDirectory}/register.gen.ts`)
    }

    // RPC bootstrap is always generated since RPC is always present
    // Include the internal meta file
    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.rpc,
      [cliConfig.rpcInternalWiringMetaFile],
      schemas
    )

    const http = await rpc.invoke('pikkuHTTP', null)
    if (http) {
      await rpc.invoke('pikkuHTTPMap', null)
      await rpc.invoke('pikkuFetch', null)
      allImports.push(cliConfig.httpWiringMetaFile, cliConfig.httpWiringsFile)

      await generateBootstrapFile(
        logger,
        cliConfig,
        cliConfig.bootstrapFiles.http,
        [cliConfig.httpWiringMetaFile, cliConfig.httpWiringsFile],
        schemas
      )
    }

    const scheduler = await rpc.invoke('pikkuScheduler', null)
    if (scheduler) {
      allImports.push(
        cliConfig.schedulersWiringMetaFile,
        cliConfig.schedulersWiringFile
      )

      await generateBootstrapFile(
        logger,
        cliConfig,
        cliConfig.bootstrapFiles.scheduler,
        [cliConfig.schedulersWiringMetaFile, cliConfig.schedulersWiringFile],
        schemas
      )
    }

    const queues = await rpc.invoke('pikkuQueue', null)
    if (queues) {
      await rpc.invoke('pikkuQueueMap', null)
      await rpc.invoke('pikkuQueueService', null)
      allImports.push(
        cliConfig.queueWorkersWiringMetaFile,
        cliConfig.queueWorkersWiringFile
      )

      await generateBootstrapFile(
        logger,
        cliConfig,
        cliConfig.bootstrapFiles.queue,
        [
          cliConfig.queueWorkersWiringMetaFile,
          cliConfig.queueWorkersWiringFile,
        ],
        schemas
      )
    }

    const channels = await rpc.invoke('pikkuChannels', null)
    if (channels) {
      await rpc.invoke('pikkuChannelsMap', null)
      await rpc.invoke('pikkuWebSocketTyped', null)
      allImports.push(
        cliConfig.channelsWiringMetaFile,
        cliConfig.channelsWiringFile
      )

      await generateBootstrapFile(
        logger,
        cliConfig,
        cliConfig.bootstrapFiles.channel,
        [cliConfig.channelsWiringMetaFile, cliConfig.channelsWiringFile],
        schemas
      )
    }

    const mcp = await rpc.invoke('pikkuMCP', null)
    if (mcp) {
      await rpc.invoke('pikkuMCPJSON', null)
      allImports.push(cliConfig.mcpWiringsMetaFile, cliConfig.mcpWiringsFile)

      await generateBootstrapFile(
        logger,
        cliConfig,
        cliConfig.bootstrapFiles.mcp,
        [cliConfig.mcpWiringsMetaFile, cliConfig.mcpWiringsFile],
        schemas
      )
    }

    const cli = await rpc.invoke('pikkuCLI', null)
    if (cli) {
      await rpc.invoke('pikkuCLIBootstrap', null)
      allImports.push(cliConfig.cliWiringMetaFile, cliConfig.cliWiringsFile)

      await generateBootstrapFile(
        logger,
        cliConfig,
        cliConfig.bootstrapFiles.cli,
        [cliConfig.cliWiringMetaFile, cliConfig.cliWiringsFile],
        schemas
      )
    }

    if (cliConfig.nextBackendFile || cliConfig.nextHTTPFile) {
      await rpc.invoke('pikkuNext', null)
    }

    if (cliConfig.openAPI) {
      logger.info(
        `• OpenAPI requires a reinspection to pickup new generated types..`
      )
      await getInspectorState(true)
      await rpc.invoke('pikkuOpenAPI', null)
    }

    // Generate main bootstrap file (pass all imports directly since this is the main file)
    await writeFileInDir(
      logger,
      cliConfig.bootstrapFile,
      allImports
        .map(
          (to) =>
            `import '${getFileImportRelativePath(cliConfig.bootstrapFile, to, cliConfig.packageMappings)}'`
        )
        .sort((to) => (to.includes('meta') ? -1 : 1)) // Ensure meta files are at the top
        .join('\n')
    )
  },
})
