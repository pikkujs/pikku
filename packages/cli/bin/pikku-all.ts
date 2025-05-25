import { Command } from 'commander'
import {
  getFileImportRelativePath,
  logInfo,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils/utils.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuHTTP } from './pikku-http-routes.js'
import { pikkuFunctionTypes } from './pikku-function-types.js'
import { pikkuHTTPMap } from './pikku-http-map.js'
import { existsSync } from 'fs'
import { pikkuFetch } from './pikku-fetch.js'
import { pikkuChannelsMap } from './pikku-channels-map.js'
import { pikkuChannels } from './pikku-channels.js'
import { pikkuNext } from './pikku-nextjs.js'
import { pikkuOpenAPI } from './pikku-openapi.js'
import { pikkuScheduler } from './pikku-scheduler.js'
import { pikkuSchemas } from './pikku-schemas.js'
import { pikkuWebSocket } from './pikku-websocket.js'
import { inspectorGlob } from '../src/inspector-glob.js'
import chokidar from 'chokidar'
import { pikkuFunctions } from './pikku-functions.js'
import { pikkuRPC } from './pikku-rpc.js'
import { pikkuRPCMap } from './pikku-rpc-map.js'
import { PikkuEventTypes } from '@pikku/core'

const runAll = async (cliConfig: PikkuCLIConfig, options: PikkuCLIOptions) => {
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
    const statement = `import '${getFileImportRelativePath(cliConfig.bootstrapFile, from, cliConfig.packageMappings)}'`
    if (type === 'meta') {
      boostrapImports.all.meta.push(statement)
    } else {
      boostrapImports.all.events.push(statement)
    }

    for (const transport of Object.keys(PikkuEventTypes)) {
      if (!addTo || addTo?.includes(transport as PikkuEventTypes)) {
        boostrapImports[transport] = boostrapImports[transport] || {
          meta: [],
          events: [],
        }
        if (type === 'meta') {
          boostrapImports[transport].meta.push(statement)
        } else {
          boostrapImports[transport].events.push(statement)
        }
      }
    }
  }

  let typesDeclarationFileExists = true
  let visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )

  if (!existsSync(cliConfig.typesDeclarationFile)) {
    typesDeclarationFileExists = false
  }
  await pikkuFunctionTypes(cliConfig, options, visitState)

  // This is needed since the addHTTPRoute function will add the routes to the visitState
  if (!typesDeclarationFileExists) {
    logInfo(`• Type file first created, inspecting again...\x1b[0m`)
    visitState = await inspectorGlob(
      cliConfig.rootDir,
      cliConfig.srcDirectories,
      cliConfig.filters
    )
  }

  const functions = pikkuFunctions(cliConfig, visitState)
  if (!functions) {
    logInfo(`• No functions found, skipping remaining steps...\x1b[0m`)
    process.exit(1)
  }
  addImport(cliConfig.functionsMetaFile, 'meta')
  addImport(cliConfig.functionsFile, 'events')

  await pikkuRPC(cliConfig, visitState)
  await pikkuRPCMap(cliConfig, visitState)
  addImport(cliConfig.rpcMetaFile, 'meta', [PikkuEventTypes.rpc])

  const schemas = await pikkuSchemas(cliConfig, visitState)
  if (schemas) {
    addImport(`${cliConfig.schemaDirectory}/register.gen.ts`, 'other')
  }

  const http = await pikkuHTTP(cliConfig, visitState)
  if (http) {
    await pikkuHTTPMap(cliConfig, visitState)
    await pikkuFetch(cliConfig)
    addImport(cliConfig.httpRoutesMetaFile, 'meta', [PikkuEventTypes.http])
    addImport(cliConfig.httpRoutesFile, 'events', [PikkuEventTypes.http])
  }

  const scheduled = await pikkuScheduler(cliConfig, visitState)
  if (scheduled) {
    addImport(cliConfig.schedulersMetaFile, 'meta', [PikkuEventTypes.scheduled])
    addImport(cliConfig.schedulersFile, 'events', [PikkuEventTypes.scheduled])
  }

  const channels = await pikkuChannels(cliConfig, visitState)
  if (channels) {
    await pikkuChannelsMap(cliConfig, visitState)
    await pikkuWebSocket(cliConfig)
    addImport(cliConfig.channelsMetaFile, 'meta', [PikkuEventTypes.channel])
    addImport(cliConfig.channelsFile, 'events', [PikkuEventTypes.channel])
  }

  if (cliConfig.nextBackendFile || cliConfig.nextHTTPFile) {
    await pikkuNext(cliConfig, visitState, options)
  }

  if (cliConfig.openAPI) {
    logInfo(`• OpenAPI requires a reinspection to pickup new generated types..`)
    visitState = await inspectorGlob(
      cliConfig.rootDir,
      cliConfig.srcDirectories,
      cliConfig.filters
    )
    await pikkuOpenAPI(cliConfig, visitState)
  }

  for (const [type, { meta, events }] of Object.entries(boostrapImports)) {
    await writeFileInDir(
      type === 'all' ? cliConfig.bootstrapFile : cliConfig.bootstrapFiles[type],
      [...meta, ...events].join('\n')
    )
  }
}

const watch = (cliConfig: PikkuCLIConfig, options: PikkuCLIOptions) => {
  const configWatcher = chokidar.watch(cliConfig.srcDirectories, {
    ignoreInitial: true,
    ignored: /.*\.gen\.tsx?/,
  })

  let watcher = new chokidar.FSWatcher({})

  const generatorWatcher = () => {
    watcher.close()

    logInfo(
      `• Watching directories: \n  - ${cliConfig.srcDirectories.join('\n  - ')}`
    )
    watcher = chokidar.watch(cliConfig.srcDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.ts/,
    })

    watcher.on('ready', async () => {
      const handle = async () => {
        try {
          await runAll(cliConfig, options)
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
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    [],
    options.tags,
    true
  )

  if (options.watch) {
    watch(cliConfig, options)
  } else {
    await runAll(cliConfig, options)
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
