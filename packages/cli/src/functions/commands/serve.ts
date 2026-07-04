import { join, resolve } from 'path'

import { pikkuSessionlessFunc } from '#pikku'
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
import { resolveConsoleMount } from './serve-console.js'

export const serve = pikkuSessionlessFunc<{ port?: string }, void>({
  remote: true,
  func: async (
    { logger, config, getInspectorState, variables, devServerRunner },
    { port }
  ) => {
    // The dev server always allows the console's dev quick login (the endpoint
    // additionally requires a loopback Host). Set PIKKU_DEV_QUICK_LOGIN=false
    // to opt out.
    process.env.PIKKU_DEV_QUICK_LOGIN ??= 'true'
    const resolvedPort = parseInt(port || '3000', 10)
    const hostname = 'localhost'
    const bindHostname = '127.0.0.1'
    const pikkuDir = resolve(config.rootDir, config.outDir)

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

    const workflowService = new InMemoryWorkflowService()

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

    const devLogger = new ConsoleLogger()
    const hasAgents = Object.keys(inspectorState.agents.agentsMeta).length > 0
    const aiAgentRunner = hasAgents
      ? await createDevAIAgentRunner({
          logger,
          projectRoot: config.rootDir,
          variables,
        })
      : undefined

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

    const consoleMount = await resolveConsoleMount()
    const pikkuServer = devServerRunner.createServer(
      {
        ...userConfig,
        hostname: bindHostname,
        port: resolvedPort,
        content: localContentConfig,
        ...(consoleMount ? { staticMounts: [consoleMount] } : {}),
      },
      logger
    )

    const lifecycle = await loadLifecycle()

    await pikkuServer.init()
    await lifecycle?.beforeStart?.(resolvedServices)
    await pikkuServer.start()
    await lifecycle?.afterStart?.(resolvedServices)

    if (consoleMount) {
      logger.info(
        `Pikku Console available at http://${hostname}:${resolvedPort}${consoleMount.urlPrefix}`
      )
    }

    process.once('SIGINT', async () => {
      logger.info('Stopping server...')
      try {
        await lifecycle?.beforeStop?.(resolvedServices)
        await stopSingletonServices()
        await pikkuServer.stop()
        await lifecycle?.afterStop?.(resolvedServices)
      } finally {
        process.exit(0)
      }
    })

    await new Promise(() => {})
  },
})
