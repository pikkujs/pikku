import { existsSync } from 'fs'
import { join, resolve } from 'path'

import { pikkuSessionlessFunc } from '#pikku'
import chokidar, { type FSWatcher } from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'
import {
  ConsoleLogger,
  InMemoryQueueService,
  InMemoryWorkflowService,
  InMemoryTriggerService,
  InMemoryAIRunStateService,
} from '@pikku/core/services'
import {
  KyselyAIStorageService,
  KyselyAIRunStateService,
  KyselyAgentRunService,
} from '@pikku/kysely'
import { stopSingletonServices } from '@pikku/core'
import { pikkuState } from '@pikku/core/internal'
import { LocalMetaService } from '@pikku/core/services/local-meta'
import { LocalEventHubService } from '@pikku/core/channel/local'
import {
  LocalContent,
  type LocalContentConfig,
} from '@pikku/core/services/local-content'
import { pikkuWebsocketHandler } from '@pikku/ws'
import { PikkuNodeHTTPServer } from '@pikku/node-http-server'
import { WebSocketServer } from 'ws'
import { InMemorySchedulerService } from '@pikku/schedule'
import { resolveLocalDb, createKysely } from '../db/local-db.js'
import { loadUserBootstrap, loadUserModule } from './load-user-project.js'

export const dev = pikkuSessionlessFunc<
  { port?: string; watch?: boolean; hmr?: boolean },
  void
>({
  remote: true,
  func: async (
    { logger, config, getInspectorState },
    { port, watch, hmr },
    { rpc }
  ) => {
    const resolvedPort = parseInt(port || '3000', 10)
    const hostname = 'localhost'
    const enableWatch = watch !== false
    const enableHmr = hmr !== false
    const commandSingletonServices = pikkuState(
      null,
      'package',
      'singletonServices'
    )
    const commandFunctionMeta = {
      ...pikkuState(null, 'function', 'meta'),
    }
    const commandFunctions = new Map(pikkuState(null, 'function', 'functions'))
    const commandRPCMeta = {
      ...pikkuState(null, 'rpc', 'meta'),
    }
    const commandWorkflowsMeta = {
      ...pikkuState(null, 'workflows', 'meta'),
    }
    const commandWorkflowRegistrations = new Map(
      pikkuState(null, 'workflows', 'registrations')
    )
    const workflowService = new InMemoryWorkflowService()
    const pikkuDir = resolve(config.rootDir, config.outDir)
    const bootstrapExists =
      existsSync(resolve(pikkuDir, 'pikku-bootstrap.gen.ts')) ||
      existsSync(resolve(pikkuDir, 'pikku-bootstrap.gen.js'))
    const runAll = async () => {
      await workflowService.runToCompletion('allWorkflow', {}, rpc)
    }
    const runAllWithCommandState = async () => {
      const previousSingletonServices = pikkuState(
        null,
        'package',
        'singletonServices'
      )
      const previousFunctions = pikkuState(null, 'function', 'functions')
      const previousFunctionMeta = pikkuState(null, 'function', 'meta')
      const previousRPCMeta = pikkuState(null, 'rpc', 'meta')
      const previousWorkflowsMeta = pikkuState(null, 'workflows', 'meta')
      const previousWorkflowRegistrations = pikkuState(
        null,
        'workflows',
        'registrations'
      )
      // During hot-reload (when user services are already live), build a hybrid services
      // object: user services (so in-flight requests keep kysely/content/etc.) overlaid
      // with the CLI config (outDir, scaffold, schemaDirectory, etc. — required by
      // allWorkflow for code generation paths). Replacing the entire services object with
      // commandSingletonServices during hot-reload caused a race condition where concurrent
      // auth requests saw CLI services (no kysely) and crashed.
      const isHotReload =
        previousSingletonServices !== commandSingletonServices &&
        !!previousSingletonServices
      const codegenServices = isHotReload
        ? ({
            ...previousSingletonServices,
            config:
              commandSingletonServices?.config ??
              previousSingletonServices.config,
          } as typeof previousSingletonServices)
        : commandSingletonServices
      pikkuState(null, 'package', 'singletonServices', codegenServices)
      pikkuState(
        null,
        'function',
        'functions',
        new Map([...previousFunctions.entries(), ...commandFunctions.entries()])
      )
      pikkuState(null, 'function', 'meta', {
        ...previousFunctionMeta,
        ...commandFunctionMeta,
      })
      pikkuState(null, 'rpc', 'meta', {
        ...previousRPCMeta,
        ...commandRPCMeta,
      })
      pikkuState(null, 'workflows', 'meta', {
        ...previousWorkflowsMeta,
        ...commandWorkflowsMeta,
      })
      pikkuState(
        null,
        'workflows',
        'registrations',
        new Map([
          ...previousWorkflowRegistrations.entries(),
          ...commandWorkflowRegistrations.entries(),
        ])
      )

      try {
        await runAll()
      } finally {
        pikkuState(
          null,
          'package',
          'singletonServices',
          previousSingletonServices
        )
        pikkuState(null, 'function', 'functions', previousFunctions)
        pikkuState(null, 'function', 'meta', previousFunctionMeta)
        pikkuState(null, 'rpc', 'meta', previousRPCMeta)
        pikkuState(null, 'workflows', 'meta', previousWorkflowsMeta)
        pikkuState(
          null,
          'workflows',
          'registrations',
          previousWorkflowRegistrations
        )
      }
    }

    if (bootstrapExists) {
      await loadUserBootstrap(pikkuDir)
    }

    await runAllWithCommandState()

    const inspectorState = await getInspectorState(true)
    const { pikkuConfigFactory, singletonServicesFactory } =
      inspectorState.filesAndMethods

    if (!pikkuConfigFactory || !singletonServicesFactory) {
      logger.error(
        'createConfig and createSingletonServices must be defined in your project'
      )
      return
    }

    if (!bootstrapExists) {
      await loadUserBootstrap(pikkuDir)
    }

    workflowService.rewireQueueWorkers()

    const configModule = await loadUserModule(pikkuConfigFactory.file)
    const servicesModule = await loadUserModule(singletonServicesFactory.file)
    const userCreateConfig = configModule[pikkuConfigFactory.variable]
    const userCreateSingletonServices =
      servicesModule[singletonServicesFactory.variable]

    const userConfig = await userCreateConfig()

    const resolvedLocalDb = resolveLocalDb(
      userConfig.dev?.db,
      config.rootDir,
      config.outDir,
      config.runtimeDir
    )
    const kysely = resolvedLocalDb
      ? await createKysely(resolvedLocalDb)
      : undefined

    const resolvedRuntimeDir =
      config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
    const localContentConfig: LocalContentConfig | undefined = userConfig.dev
      ?.content
      ? {
          localFileUploadPath: join(resolvedRuntimeDir, 'content'),
          uploadUrlPrefix: '/upload',
          assetUrlPrefix: '/assets',
          server: `http://${hostname}:${resolvedPort}`,
          ...(userConfig.dev.content !== true ? userConfig.dev.content : {}),
        }
      : undefined
    const localContent = localContentConfig
      ? new LocalContent(localContentConfig, logger)
      : undefined

    const schedulerService = new InMemorySchedulerService()
    const aiStorage = kysely
      ? new KyselyAIStorageService(kysely as any)
      : undefined
    const aiRunState = kysely
      ? new KyselyAIRunStateService(kysely as any)
      : new InMemoryAIRunStateService()
    const agentRunService = kysely
      ? new KyselyAgentRunService(kysely as any)
      : undefined

    if (aiStorage) await aiStorage.init()
    if ('init' in aiRunState && typeof aiRunState.init === 'function') {
      await aiRunState.init()
    }

    // InMemoryWorkflowService implements both the workflowService and
    // workflowRunService surfaces (listRuns/getRun live on it). Expose the
    // single instance under both names so addons like @pikku/addon-console
    // can read runs in dev without projects having to wire their own backing
    // store.
    const inMemoryServices = {
      logger: new ConsoleLogger(),
      metaService: new LocalMetaService(pikkuDir),
      schedulerService,
      queueService: new InMemoryQueueService(),
      workflowService,
      workflowRunService: workflowService,
      triggerService: new InMemoryTriggerService(),
      aiStorage,
      aiRunState,
      agentRunService,
      eventHub: new LocalEventHubService(),
      ...(kysely ? { kysely } : {}),
      ...(localContent ? { content: localContent } : {}),
    }

    const singletonServices = await userCreateSingletonServices(userConfig, {
      ...inMemoryServices,
      getInspectorState,
    })
    pikkuState(null, 'package', 'singletonServices', {
      ...singletonServices,
      getInspectorState,
    })

    const wss = new WebSocketServer({ noServer: true })
    const pikkuServer = new PikkuNodeHTTPServer(
      {
        ...userConfig,
        hostname,
        port: resolvedPort,
        content: localContentConfig,
      },
      logger,
      {
        configureServer: (httpServer) => {
          pikkuWebsocketHandler({ server: httpServer, wss, logger })
        },
      }
    )

    await pikkuServer.init()
    await schedulerService.start()
    await pikkuServer.start()

    let configWatcher: FSWatcher | undefined
    let watcher: FSWatcher | undefined

    process.once('SIGINT', async () => {
      logger.info('Stopping dev server...')
      try {
        await stopSingletonServices()
        await configWatcher?.close()
        await watcher?.close()
        await new Promise<void>((resolve, reject) =>
          wss.close((err) => (err ? reject(err) : resolve()))
        )
        await pikkuServer.stop()
      } finally {
        process.exit(0)
      }
    })

    if (enableHmr) {
      await pikkuDevReloader({
        srcDirectories: config.srcDirectories,
        logger,
      })
    }

    if (enableWatch) {
      const genIgnore = /\.gen\.tsx?$/

      configWatcher = chokidar.watch(config.srcDirectories, {
        ignoreInitial: true,
        ignored: genIgnore,
      })

      const generatorWatcher = () => {
        watcher?.close()

        logger.info(
          `• Watching directories: \n  - ${config.srcDirectories.join('\n  - ')}`
        )
        watcher = chokidar.watch(config.srcDirectories, {
          ignoreInitial: true,
          ignored: genIgnore,
        })

        watcher.on('ready', async () => {
          const handle = async () => {
            try {
              const start = Date.now()
              await runAllWithCommandState()
              workflowService.rewireQueueWorkers()
              logger.info({
                message: `✓ Generated in ${Date.now() - start}ms`,
                type: 'timing',
              })
            } catch (err) {
              logger.error(`Error running watch: ${err}`)
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

          watcher?.on('change', deduped)
          watcher?.on('add', deduped)
          watcher?.on('unlink', deduped)
        })
      }

      configWatcher.on('ready', generatorWatcher)
      configWatcher.on('change', generatorWatcher)
    }

    await new Promise(() => {})
  },
})
