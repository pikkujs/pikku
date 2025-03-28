import { Command } from 'commander'
import {
  getFileImportRelativePath,
  logInfo,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuHTTP } from './pikku-http.js'
import { pikkuFunctionTypes } from './pikku-function-types.js'
import { pikkuHTTPMap } from './pikku-routes-map.js'
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

const runAll = async (cliConfig: PikkuCLIConfig, options: PikkuCLIOptions) => {
  const imports: string[] = []
  const addImport = (from: string) => {
    imports.push(
      `import '${getFileImportRelativePath(cliConfig.bootstrapFile, from, cliConfig.packageMappings)}'`
    )
  }

  let typesDeclarationFileExists = true
  let visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories,
    cliConfig.filters
  )

  if (!existsSync(cliConfig.typesDeclarationFile)) {
    typesDeclarationFileExists = false
  }
  await pikkuFunctionTypes(cliConfig, options, visitState)

  // This is needed since the addRoutes function will add the routes to the visitState
  if (!typesDeclarationFileExists) {
    logInfo(`• Type file first created, inspecting again...\x1b[0m`)
    visitState = await inspectorGlob(
      cliConfig.rootDir,
      cliConfig.routeDirectories,
      cliConfig.filters
    )
  }

  const routes = await pikkuHTTP(cliConfig, visitState)
  if (routes) {
    await pikkuHTTPMap(cliConfig, visitState)
    await pikkuFetch(cliConfig)
    addImport(cliConfig.routesFile)
  }

  const scheduled = await pikkuScheduler(cliConfig, visitState)
  if (scheduled) {
    addImport(cliConfig.schedulersFile)
  }

  const channels = await pikkuChannels(cliConfig, visitState)
  if (channels) {
    await pikkuChannelsMap(cliConfig, visitState)
    await pikkuWebSocket(cliConfig)
    addImport(cliConfig.channelsFile)
  }

  const schemas = await pikkuSchemas(cliConfig, visitState)
  if (schemas) {
    addImport(`${cliConfig.schemaDirectory}/register.gen.ts`)
  }

  await pikkuNext(cliConfig, visitState, options)

  if (cliConfig.openAPI) {
    logInfo(`• OpenAPI requires a reinspection to pickup new generated types..`)
    visitState = await inspectorGlob(
      cliConfig.rootDir,
      cliConfig.routeDirectories,
      cliConfig.filters
    )
    await pikkuOpenAPI(cliConfig, visitState)
  }

  await writeFileInDir(cliConfig.bootstrapFile, imports.join('\n'))
}

const watch = (cliConfig: PikkuCLIConfig, options: PikkuCLIOptions) => {
  const configWatcher = chokidar.watch(cliConfig.routeDirectories, {
    ignoreInitial: true,
    ignored: /.*\.gen\.tsx?/,
  })

  let watcher = new chokidar.FSWatcher({})

  const generatorWatcher = () => {
    watcher.close()

    logInfo(
      `• Watching directories: \n  - ${cliConfig.routeDirectories.join('\n  - ')}`
    )
    watcher = chokidar.watch(cliConfig.routeDirectories, {
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
