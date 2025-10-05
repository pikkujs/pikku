import { Command } from 'commander'
import {
  CLILogger,
  getFileImportRelativePath,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuHTTP } from '../src/wirings/http/pikku-command-http-routes.js'
import { pikkuFunctionTypes } from '../src/wirings/functions/pikku-command-function-types.js'
import { pikkuFunctionTypesSplit } from '../src/wirings/functions/pikku-command-function-types-split.js'
import { pikkuHTTPMap } from '../src/wirings/http/pikku-command-http-map.js'
import { existsSync } from 'fs'
import { pikkuChannelsMap } from '../src/wirings/channels/pikku-command-channels-map.js'
import { pikkuChannels } from '../src/wirings/channels/pikku-command-channels.js'
import { inspectorGlob } from '../src/inspector-glob.js'
import chokidar from 'chokidar'
import { pikkuFunctions } from '../src/wirings/functions/pikku-command-functions.js'
import { pikkuServices } from '../src/wirings/functions/pikku-command-services.js'
import { pikkuRPC } from '../src/wirings/rpc/pikku-command-rpc.js'
import {
  pikkuRPCExposedMap,
  pikkuRPCInternalMap,
} from '../src/wirings/rpc/pikku-command-rpc-map.js'
import { pikkuQueue } from '../src/wirings/queue/pikku-command-queue.js'
import { pikkuQueueMap } from '../src/wirings/queue/pikku-command-queue-map.js'
import { pikkuFetch } from '../src/wirings/fetch/index.js'
import { pikkuRPCClient } from '../src/wirings/rpc/pikku-command-rpc-client.js'
import { pikkuWebSocketTyped } from '../src/wirings/channels/pikku-command-websocket-typed.js'
import { pikkuOpenAPI } from '../src/wirings/http/pikku-command-openapi.js'
import { pikkuMCP } from '../src/wirings/mcp/pikku-command-mcp.js'
import { pikkuQueueService } from '../src/wirings/queue/pikku-command-queue-service.js'
import { pikkuScheduler } from '../src/wirings/scheduler/pikku-command-scheduler.js'
import { pikkuSchemas } from '../src/schemas.js'
import { pikkuMCPJSON } from '../src/wirings/mcp/pikku-command-mcp-json.js'
import { pikkuCLI } from '../src/wirings/cli/pikku-command-cli.js'
import { pikkuCLIBootstrap } from '../src/wirings/cli/pikku-command-cli-bootstrap.js'
import { pikkuCLITypes } from '../src/wirings/cli/pikku-command-cli-types.js'
import { pikkuHTTPTypes } from '../src/wirings/http/pikku-command-http-types.js'
import { pikkuChannelTypes } from '../src/wirings/channels/pikku-command-channel-types.js'
import { pikkuSchedulerTypes } from '../src/wirings/scheduler/pikku-command-scheduler-types.js'
import { pikkuQueueTypes } from '../src/wirings/queue/pikku-command-queue-types.js'
import { pikkuMCPTypes } from '../src/wirings/mcp/pikku-command-mcp-types.js'
import { pikkuNext } from '../src/runtimes/nextjs/pikku-command-nextjs.js'

const generateBootstrapFile = async (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  bootstrapFile: string,
  specificImports: string[],
  schemas?: boolean
) => {
  // Common imports that every bootstrap file needs
  const commonImports = [
    cliConfig.functionsMetaMinFile,
    cliConfig.functionsFile,
  ]

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

  // This is needed since the wireHTTP function will add the routes to the visitState
  if (!typesDeclarationFileExists) {
    logger.info(`• Type file first created, inspecting again...\x1b[0m`)
    visitState = await inspectorGlob(
      logger,
      cliConfig.rootDir,
      cliConfig.srcDirectories,
      cliConfig.filters
    )
  }

  // Generate wiring-specific type files for tree-shaking
  await pikkuFunctionTypesSplit(logger, cliConfig, visitState, options)
  await pikkuHTTPTypes(logger, cliConfig)
  await pikkuChannelTypes(logger, cliConfig)
  await pikkuSchedulerTypes(logger, cliConfig)
  await pikkuQueueTypes(logger, cliConfig)
  await pikkuMCPTypes(logger, cliConfig)
  await pikkuCLITypes(logger, cliConfig)

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
  await pikkuRPCInternalMap(logger, cliConfig, visitState)
  await pikkuRPCExposedMap(logger, cliConfig, visitState)
  await pikkuRPCClient(logger, cliConfig)

  allImports.push(cliConfig.rpcInternalWiringMetaFile)

  const schemas = await pikkuSchemas(logger, cliConfig, visitState)
  if (schemas) {
    allImports.push(`${cliConfig.schemaDirectory}/register.gen.ts`)
  }

  // RPC bootstrap is always generated since RPC is always present
  await generateBootstrapFile(
    logger,
    cliConfig,
    cliConfig.bootstrapFiles.rpc,
    [],
    schemas
  )

  const http = await pikkuHTTP(logger, cliConfig, visitState)
  if (http) {
    await pikkuHTTPMap(logger, cliConfig, visitState)
    await pikkuFetch(logger, cliConfig)
    allImports.push(cliConfig.httpWiringMetaFile, cliConfig.httpWiringsFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.http,
      [cliConfig.httpWiringMetaFile, cliConfig.httpWiringsFile],
      schemas
    )
  }

  const scheduler = await pikkuScheduler(logger, cliConfig, visitState)
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

  const queues = await pikkuQueue(logger, cliConfig, visitState)
  if (queues) {
    await pikkuQueueMap(logger, cliConfig, visitState)
    await pikkuQueueService(logger, cliConfig)
    allImports.push(
      cliConfig.queueWorkersWiringMetaFile,
      cliConfig.queueWorkersWiringFile
    )

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.queue,
      [cliConfig.queueWorkersWiringMetaFile, cliConfig.queueWorkersWiringFile],
      schemas
    )
  }

  const channels = await pikkuChannels(logger, cliConfig, visitState)
  if (channels) {
    await pikkuChannelsMap(logger, cliConfig, visitState)
    await pikkuWebSocketTyped(logger, cliConfig)
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

  const mcp = await pikkuMCP(logger, cliConfig, visitState)
  if (mcp) {
    await pikkuMCPJSON(logger, cliConfig, visitState)
    allImports.push(cliConfig.mcpWiringsMetaFile, cliConfig.mcpWiringsFile)

    await generateBootstrapFile(
      logger,
      cliConfig,
      cliConfig.bootstrapFiles.mcp,
      [cliConfig.mcpWiringsMetaFile, cliConfig.mcpWiringsFile],
      schemas
    )
  }

  const cli = await pikkuCLI(logger, cliConfig, visitState)
  if (cli) {
    await pikkuCLIBootstrap(logger, cliConfig, visitState)
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
          const start = Date.now()
          await runAll(logger, cliConfig, options)
          if (options.silent) {
            logger.timing(`✓ Generated in ${Date.now() - start}ms`)
          }
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
  const logger = new CLILogger({ logLogo: true, silent: options.silent })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    [],
    {
      tags: options.tags,
      types: options.types,
      directories: options.directories,
    },
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
    .option('--pikku-config-type', 'The type of your pikku config object')
    .option(
      '--singleton-services-factory-type',
      'The type of your singleton services factory'
    )
    .option(
      '--session-services-factory-type',
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
    .option('-s | --silent', 'Silent mode - only show errors')
    .action(action)
}
