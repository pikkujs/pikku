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
import { pikkuRPC } from '../src/events/rpc/pikku-command-rpc.js'
import { pikkuRPCMap } from '../src/events/rpc/pikku-command-rpc-map.js'
import { PikkuEventTypes } from '@pikku/core'
import { pikkuQueue } from '../src/events/queue/pikku-command-queue.js'
import { pikkuQueueMap } from '../src/events/queue/pikku-command-queue-map.js'
import { pikkuFetch } from '../src/events/fetch/index.js'
import { pikkuRPCClient } from '../src/events/rpc/pikku-command-rpc-client.js'
import { pikkuWebSocketTyped } from '../src/events/channels/pikku-command-websocket-typed.js'
import { pikkuNext } from '../src/events/http/pikku-command-nextjs.js'
import { pikkuOpenAPI } from '../src/events/http/pikku-command-openapi.js'
import { pikkuMCP } from '../src/events/mcp/pikku-command-mcp.js'
import { pikkuQueueService } from '../src/events/queue/pikku-command-queue-service.js'
import { pikkuScheduler } from '../src/events/scheduler/pikku-command-scheduler.js'
import { pikkuSchemas } from '../src/schemas.js'
import { pikkuMCPJSON } from '../src/events/mcp/pikku-command-mcp-json.js'

const runAll = async (
  logger: CLILogger,
  cliConfig: PikkuCLIConfig,
  options: PikkuCLIOptions
) => {
  const boostrapImports: Partial<
    Record<PikkuEventTypes, { meta: string[]; events: string[] }>
  > & { all: { meta: string[]; events: string[] } } = {
    all: { meta: [], events: [] },
  }

  const addImport = (
    from: string,
    type: 'meta' | 'events' | 'other',
    addTo?: PikkuEventTypes[]
  ) => {
    if (type === 'meta') {
      boostrapImports.all.meta.push(from)
    } else {
      boostrapImports.all.events.push(from)
    }

    for (const transport of Object.keys(PikkuEventTypes)) {
      if (!addTo || addTo?.includes(transport as PikkuEventTypes)) {
        boostrapImports[transport] = boostrapImports[transport] || {
          meta: [],
          events: [],
        }
        if (type === 'meta') {
          boostrapImports[transport].meta.push(from)
        } else {
          boostrapImports[transport].events.push(from)
        }
      }
    }
  }

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
  addImport(cliConfig.functionsMetaFile, 'meta')
  addImport(cliConfig.functionsFile, 'events')

  await pikkuRPC(logger, cliConfig, visitState)
  await pikkuRPCMap(logger, cliConfig, visitState)
  await pikkuRPCClient(logger, cliConfig)
  addImport(cliConfig.rpcMetaFile, 'meta', [PikkuEventTypes.rpc])

  const schemas = await pikkuSchemas(logger, cliConfig, visitState)
  if (schemas) {
    addImport(`${cliConfig.schemaDirectory}/register.gen.ts`, 'other')
  }

  const http = await pikkuHTTP(logger, cliConfig, visitState)
  if (http) {
    await pikkuHTTPMap(logger, cliConfig, visitState)
    await pikkuFetch(logger, cliConfig)
    addImport(cliConfig.httpRoutesMetaFile, 'meta', [PikkuEventTypes.http])
    addImport(cliConfig.httpRoutesFile, 'events', [PikkuEventTypes.http])
  }

  const scheduled = await pikkuScheduler(logger, cliConfig, visitState)
  if (scheduled) {
    addImport(cliConfig.schedulersMetaFile, 'meta', [PikkuEventTypes.scheduled])
    addImport(cliConfig.schedulersFile, 'events', [PikkuEventTypes.scheduled])
  }

  const queues = await pikkuQueue(logger, cliConfig, visitState)
  if (queues) {
    await pikkuQueueMap(logger, cliConfig, visitState)
    await pikkuQueueService(logger, cliConfig)
    addImport(cliConfig.queueWorkersMetaFile, 'meta', [PikkuEventTypes.queue])
    addImport(cliConfig.queueWorkersFile, 'events', [PikkuEventTypes.queue])
  }

  const channels = await pikkuChannels(logger, cliConfig, visitState)
  if (channels) {
    await pikkuChannelsMap(logger, cliConfig, visitState)
    await pikkuWebSocketTyped(logger, cliConfig)
    addImport(cliConfig.channelsMetaFile, 'meta', [PikkuEventTypes.channel])
    addImport(cliConfig.channelsFile, 'events', [PikkuEventTypes.channel])
  }

  const mcp = await pikkuMCP(logger, cliConfig, visitState)
  if (mcp) {
    await pikkuMCPJSON(logger, cliConfig, visitState)
    addImport(cliConfig.mcpEndpointsMetaFile, 'meta', [PikkuEventTypes.mcp])
    addImport(cliConfig.mcpEndpointsFile, 'events', [PikkuEventTypes.mcp])
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

  for (const [type, { meta, events }] of Object.entries(boostrapImports)) {
    const bootstrapFile =
      type === 'all' ? cliConfig.bootstrapFile : cliConfig.bootstrapFiles[type]
    await writeFileInDir(
      logger,
      bootstrapFile,
      [...meta, ...events]
        .map(
          (to) =>
            `import '${getFileImportRelativePath(bootstrapFile, to, cliConfig.packageMappings)}'`
        )
        .join('\n')
    )
  }
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
    options.tags,
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
    .option('-w | --watch', 'Whether to watch file changes')
    .action(action)
}
