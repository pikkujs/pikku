import { join, resolve } from 'path'

import { pikkuSessionlessFunc } from '#pikku'
import chokidar, { type FSWatcher } from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'
import {
  ConsoleLogger,
  LocalEmailService,
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
import {
  LocalContent,
  type LocalContentConfig,
} from '@pikku/core/services/local-content'
import { InMemorySchedulerService } from '@pikku/schedule'
import {
  resolveDb,
  createKysely,
  parseDatabaseUrl,
  type ResolvedDb,
} from '../db/local-db.js'
import { loadUserBootstrap, loadUserModule } from './load-user-project.js'
import { createDevAIAgentRunner } from './dev-ai-runner.js'
import { startConsoleServer } from './serve-console.js'

export const dev = pikkuSessionlessFunc<
  { port?: string; watch?: boolean; hmr?: boolean; console?: string | boolean },
  void
>({
  remote: true,
  func: async (
    { logger, config, getInspectorState, variables, devServerRunner },
    { port, watch, hmr, console: consoleFlag },
    { rpc }
  ) => {
    // The dev server always allows the console's dev quick login (the endpoint
    // additionally requires a loopback Host). Set PIKKU_DEV_QUICK_LOGIN=false
    // to opt out.
    process.env.PIKKU_DEV_QUICK_LOGIN ??= 'true'
    const resolvedPort = parseInt(port || '3000', 10)
    const hostname = 'localhost'
    // Bind on IPv4 loopback explicitly. Under Bun, hostname 'localhost' resolves
    // to IPv6 [::1] only, so a 127.0.0.1 proxy (e.g. the sandbox Caddy) can't
    // reach it. '127.0.0.1' binds IPv4 on both Node and Bun (Node otherwise
    // relies on --dns-result-order=ipv4first for the same effect). `hostname`
    // stays 'localhost' for the user-facing content URL below.
    const bindHostname = '127.0.0.1'
    const enableWatch = watch !== false
    const enableHmr = hmr !== false
    const watchDirectories = [
      ...new Set(
        [config.emailTemplatesDir, ...config.srcDirectories].filter(Boolean)
      ),
    ] as string[]
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

    await loadUserBootstrap(pikkuDir)

    const configModule = await loadUserModule(pikkuConfigFactory.file)
    const servicesModule = await loadUserModule(singletonServicesFactory.file)
    const userCreateConfig = configModule[pikkuConfigFactory.variable]
    const userCreateSingletonServices =
      servicesModule[singletonServicesFactory.variable]

    const userConfig = await userCreateConfig()

    const envDatabaseUrl = await variables.get('DATABASE_URL')
    const effectiveDbConfig = envDatabaseUrl
      ? parseDatabaseUrl(envDatabaseUrl)
      : userConfig
    const resolvedDb = resolveDb(
      effectiveDbConfig,
      config.rootDir,
      config.outDir,
      config.runtimeDir
    )
    const resolvedLocalDb: ResolvedDb | undefined = resolvedDb ?? undefined
    const kysely = resolvedLocalDb
      ? await createKysely(resolvedLocalDb)
      : undefined

    const resolvedRuntimeDir =
      config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
    const localContentConfig: LocalContentConfig | undefined =
      userConfig.content
        ? {
            localFileUploadPath: userConfig.content.contentPath
              ? resolve(config.rootDir, userConfig.content.contentPath)
              : join(resolvedRuntimeDir, 'content'),
            uploadUrlPrefix: userConfig.content.uploadUrlPrefix ?? '/upload',
            assetUrlPrefix: userConfig.content.assetUrlPrefix ?? '/assets',
            server: `http://${hostname}:${resolvedPort}`,
            sizeLimit: userConfig.content.sizeLimit,
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
    const devLogger = new ConsoleLogger()
    // Deployed agent units get their runner from the bundler; the dev server
    // has no equivalent, so construct one from env or agents 503 with
    // AIProviderNotConfiguredError. The template forwards injected services
    // (`...existingServices`) so this reaches getSingletonServices().
    // Only when the project declares agents — otherwise the runner's
    // missing-SDK warning fires spuriously for projects with global AI env.
    const hasAgents = Object.keys(inspectorState.agents.agentsMeta).length > 0
    const aiAgentRunner = hasAgents
      ? await createDevAIAgentRunner({
          logger,
          projectRoot: config.rootDir,
          variables,
        })
      : undefined
    // The dev server runner (node http+ws, or bun-server) is resolved by DI in
    // services.ts. Its EventHub is shared into the singleton services so
    // function-side broadcasts reach the sockets the transport holds.
    const eventHub = await devServerRunner.createEventHub()
    const inMemoryServices = {
      logger: devLogger,
      ...(aiAgentRunner ? { aiAgentRunner } : {}),
      emailService: new LocalEmailService(),
      metaService: new LocalMetaService(pikkuDir),
      schedulerService,
      queueService: new InMemoryQueueService(),
      workflowService,
      workflowRunService: workflowService,
      triggerService: new InMemoryTriggerService(),
      aiStorage,
      aiRunState,
      agentRunService,
      eventHub,
      ...(kysely ? { kysely } : {}),
      ...(localContent ? { content: localContent } : {}),
    }

    const singletonServices = await userCreateSingletonServices(userConfig, {
      ...inMemoryServices,
      getInspectorState,
    })
    const resolvedServices = { ...singletonServices, getInspectorState }
    pikkuState(null, 'package', 'singletonServices', resolvedServices)
    resolvedServices.workflowService?.wireQueueWorkers?.()

    const { serverLifecycleFactory } = inspectorState.filesAndMethods
    const loadLifecycle = async () => {
      if (!serverLifecycleFactory) return undefined
      const m = await loadUserModule(serverLifecycleFactory.file)
      return m[serverLifecycleFactory.variable]
    }

    const pikkuServer = devServerRunner.createServer(
      {
        ...userConfig,
        hostname: bindHostname,
        port: resolvedPort,
        content: localContentConfig,
      },
      logger
    )

    const lifecycle = await loadLifecycle()

    await pikkuServer.init()
    await lifecycle?.beforeStart?.(resolvedServices)
    await pikkuServer.start()
    await lifecycle?.afterStart?.(resolvedServices)

    const consoleServer = consoleFlag
      ? await startConsoleServer(consoleFlag, hostname, logger)
      : undefined

    let configWatcher: FSWatcher | undefined
    let watcher: FSWatcher | undefined

    process.once('SIGINT', async () => {
      logger.info('Stopping dev server...')
      try {
        await lifecycle?.beforeStop?.(resolvedServices)
        await stopSingletonServices()
        await configWatcher?.close()
        await watcher?.close()
        await pikkuServer.stop()
        consoleServer?.close()
        await lifecycle?.afterStop?.(resolvedServices)
      } finally {
        process.exit(0)
      }
    })

    if (enableHmr) {
      await pikkuDevReloader({
        srcDirectories: watchDirectories,
        logger,
      })
    }

    if (enableWatch) {
      const genIgnore = /\.gen\.tsx?$/

      configWatcher = chokidar.watch(watchDirectories, {
        ignoreInitial: true,
        ignored: genIgnore,
      })

      const generatorWatcher = () => {
        watcher?.close()

        logger.info(
          `• Watching directories: \n  - ${watchDirectories.join('\n  - ')}`
        )
        watcher = chokidar.watch(watchDirectories, {
          ignoreInitial: true,
          ignored: genIgnore,
        })

        watcher.on('ready', async () => {
          const handle = async () => {
            try {
              const start = Date.now()
              await runAllWithCommandState()
              workflowService.wireQueueWorkers()
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
