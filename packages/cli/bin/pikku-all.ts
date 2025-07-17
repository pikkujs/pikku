import { Command } from 'commander'
import {
  CLILogger,
  getFileImportRelativePath,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuHTTP } from '../src/events/http/pikku-command-http-routes.js'
import { pikkuFunctionTypes } from '../src/events/functions/pikku-command-function-types.js'
import { pikkuHTTPMap } from '../src/events/http/pikku-command-http-map.js'
import { existsSync } from 'fs'
import { pikkuChannelsMap } from '../src/events/channels/pikku-command-channels-map.js'
import { pikkuChannels } from '../src/events/channels/pikku-command-channels.js'
import { inspectorGlob } from '../src/inspector-glob.js'
import chokidar from 'chokidar'
import { pikkuFunctions } from '../src/events/functions/pikku-command-functions.js'
import { pikkuServices } from '../src/events/functions/pikku-command-services.js'
import { pikkuRPC } from '../src/events/rpc/pikku-command-rpc.js'
import { pikkuRPCMap } from '../src/events/rpc/pikku-command-rpc-map.js'
import { pikkuQueue } from '../src/events/queue/pikku-command-queue.js'
import { pikkuQueueMap } from '../src/events/queue/pikku-command-queue-map.js'
import { pikkuFetch } from '../src/events/fetch/index.js'
import { pikkuRPCClient } from '../src/events/rpc/pikku-command-rpc-client.js'
import { pikkuWebSocketTyped } from '../src/events/channels/pikku-command-websocket-typed.js'
import { pikkuOpenAPI } from '../src/events/http/pikku-command-openapi.js'
import { pikkuMCP } from '../src/events/mcp/pikku-command-mcp.js'
import { pikkuQueueService } from '../src/events/queue/pikku-command-queue-service.js'
import { pikkuScheduler } from '../src/events/scheduler/pikku-command-scheduler.js'
import { pikkuSchemas } from '../src/schemas.js'
import { pikkuMCPJSON } from '../src/events/mcp/pikku-command-mcp-json.js'
import { pikkuNext } from '../src/runtimes/nextjs/pikku-command-nextjs.js'

const generateBootstrapFile = async (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  bootstrapFile: string,
  specificImports: string[],
  schemas?: boolean
) => {
  // Common imports that every bootstrap file needs
  const commonImports = [cliConfig.functionsMetaFile, cliConfig.functionsFile]

  // Add schema if it exists
  if (schemas) {
    commonImports.push(`${cliConfig.schemaDirectory}/register.gen.ts`)
  }

  // Combine common imports with specific imports
  const allImports = [...commonImports, ...specificImports]

  await writeFileInDir(
    logger,
    bootstrapFile,
    allImports
      .map(
        (to) =>
          `import '${getFileImportRelativePath(bootstrapFile, to, cliConfig.packageMappings)}'`
      )
      .sort((to) => (to.includes('meta') ? -1 : 1)) // Ensure meta files are at the top
      .join('\n')
  )
}

const runAll = async (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  options: PikkuCLIOptions
) => {
  const allImports: string[] = []

  let typesDeclarationFileExists = true
  let visitState = await inspectorGlob(
    logger,
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )

  if (!existsSync(cliConfig.typesDeclarationFile)) {
    typesDeclarationFileExists = false
  }
  await pikkuFunctionTypes(logger, cliConfig, visitState, options)

  // This is needed since the addHTTPRoute function will add the routes to the visitState
  if (!typesDeclarationFileExists) {
    logger.info(`• Type file first created, inspecting again...\x1b[0m`)
    visitState = await inspectorGlob(
      logger,
      cliConfig.rootDir,
      cliConfig.srcDirectories,
      cliConfig.filters
    )
  }

  const functions = pikkuFunctions(logger, cliConfig, visitState)
  if (!functions) {
    logger.info(`• No functions found, skipping remaining steps...\x1b[0m`)
    process.exit(1)
  }

  // Base imports for all bootstrap files
  allImports.push(cliConfig.functionsMetaFile, cliConfig.functionsFile)

  // Generate services map
  await pikkuServices(logger, cliConfig, visitState)

  await pikkuRPC(logger, cliConfig, visitState)
  await pikkuRPCMap(logger, cliConfig, visitState)
  await pikkuRPCClient(logger, cliConfig)
  allImports.push(cliConfig.rpcMetaFile)

  const schemas = await pikkuSchemas(logger, cliConfig, visitState)
  if (schemas) {
    allImports.push(`${cliConfig.schemaDirectory}/register.gen.ts`)
  }

  // RPC bootstrap is always generated since RPC is always present
  await generateBootstrapFile(
    logger,
    cliConfig,
    cliConfig.bootstrapFiles.rpc,
    [cliConfig.rpcMetaFile],
    schemas
  )

  const http = await pikkuHTTP(logger, cliConfig, visitState)
  if (http) {
    await pikkuHTTPMap(logger, cliConfig, visitState)
    await pikkuFetch(logger, cliConfig)
    allImports.push(cliConfig.httpRoutesMetaFile, cliConfig.httpRoutesFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.http,
      [cliConfig.httpRoutesMetaFile, cliConfig.httpRoutesFile],
      schemas
    )
  }

  const scheduler = await pikkuScheduler(logger, cliConfig, visitState)
  if (scheduler) {
    allImports.push(cliConfig.schedulersMetaFile, cliConfig.schedulersFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.scheduler,
      [cliConfig.schedulersMetaFile, cliConfig.schedulersFile],
      schemas
    )
  }

  const queues = await pikkuQueue(logger, cliConfig, visitState)
  if (queues) {
    await pikkuQueueMap(logger, cliConfig, visitState)
    await pikkuQueueService(logger, cliConfig)
    allImports.push(cliConfig.queueWorkersMetaFile, cliConfig.queueWorkersFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.queue,
      [cliConfig.queueWorkersMetaFile, cliConfig.queueWorkersFile],
      schemas
    )
  }

  const channels = await pikkuChannels(logger, cliConfig, visitState)
  if (channels) {
    await pikkuChannelsMap(logger, cliConfig, visitState)
    await pikkuWebSocketTyped(logger, cliConfig)
    allImports.push(cliConfig.channelsMetaFile, cliConfig.channelsFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.channel,
      [cliConfig.channelsMetaFile, cliConfig.channelsFile],
      schemas
    )
  }

  const mcp = await pikkuMCP(logger, cliConfig, visitState)
  if (mcp) {
    await pikkuMCPJSON(logger, cliConfig, visitState)
    allImports.push(cliConfig.mcpEndpointsMetaFile, cliConfig.mcpEndpointsFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.mcp,
      [cliConfig.mcpEndpointsMetaFile, cliConfig.mcpEndpointsFile],
      schemas
    )
  }

  if (cliConfig.nextBackendFile || cliConfig.nextHTTPFile) {
    await pikkuNext(logger, cliConfig, visitState, options)
  }

  if (cliConfig.openAPI) {
    logger.info(
      `• OpenAPI requires a reinspection to pickup new generated types..`
    )
    visitState = await inspectorGlob(
      logger,
      cliConfig.rootDir,
      cliConfig.srcDirectories,
      cliConfig.filters
    )
    await pikkuOpenAPI(logger, cliConfig, visitState)
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
}

const watch = (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  options: PikkuCLIOptions
) => {
  const configWatcher = chokidar.watch(cliConfig.srcDirectories, {
    ignoreInitial: true,
    ignored: /.*\.gen\.tsx?/,
  })

  let watcher = new chokidar.FSWatcher({})

  const generatorWatcher = () => {
    watcher.close()

    logger.info(
      `• Watching directories: \n  - ${cliConfig.srcDirectories.join('\n  - ')}`
    )
    watcher = chokidar.watch(cliConfig.srcDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.ts/,
    })

    watcher.on('ready', async () => {
      const handle = async () => {
        try {
          await runAll(logger, cliConfig, options)
        } catch (err) {
          console.error(err)
          console.info()
        }
      }

      await handle()

      let timeout: ReturnType<typeof setTimeout> | undefined

      const deduped = (_file: string) => {
        if (timeout) {
          clearTimeout(timeout)
        }
        timeout = setTimeout(handle, 10)
      }

      watcher.on('change', deduped)
      watcher.on('add', deduped)
      watcher.on('unlink', deduped)
    })
  }

  configWatcher.on('ready', generatorWatcher)
  configWatcher.on('change', generatorWatcher)
}

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  const logger = new CLILogger({ logLogo: true })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    [],
    options.tags || [],
    options.types || [],
    options.directories || [],
    true
  )

  if (options.watch) {
    watch(logger, cliConfig, options)
  } else {
    await runAll(logger, cliConfig, options)
  }
}

export const all = (program: Command): void => {
  program
    .command('all', { isDefault: true })
    .description('Generate all the files used by pikku')
    .option('-ct | --pikku-config-type', 'The type of your pikku config object')
    .option(
      '-ss | --singleton-services-factory-type',
      'The type of your singleton services factory'
    )
    .option(
      '-se | --session-services-factory-type',
      'The type of your session services factory'
    )
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .option('-t | --tags <tags...>', 'Which tags to filter by')
    .option(
      '--types <types...>',
      'Which types to filter by (http, channel, queue, scheduler, rpc, mcp)'
    )
    .option('--directories <directories...>', 'Which directories to filter by')
    .option('-w | --watch', 'Whether to watch file changes')
    .action(action)
}
