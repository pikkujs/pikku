import { join, resolve } from 'path'

import { pikkuSessionlessFunc } from '#pikku/function'
import { InMemoryQueueService, QueueWebhookService } from '@pikku/core/services'
import { flattenScopeDefinitions } from '@pikku/core/scope'
import { flattenSystemRoleDefinitions } from '@pikku/core/role'
import {
  ConsoleLogger,
  LocalEmailService,
  InMemoryAgentRunStateService,
} from '@pikku/core/services'
import { InMemoryTriggerService } from '@pikku/core/services'
import { InMemoryWorkflowService } from '@pikku/core/services'
import {
  KyselyAgentStorageService,
  KyselyAgentRunStateService,
  KyselyAgentRunService,
  KyselyScopeService,
  KyselyWebhookService,
} from '@pikku/kysely'
import { stopSingletonServices } from '@pikku/core/utils'
import { pikkuState } from '@pikku/core/state'
import { wireAgentScorerQueueWorkers } from '@pikku/core/agent-scorer'
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
import { registerScenarioInstrumentation } from '../wirings/scenarios/register-scenario-instrumentation.js'
import { createDevAgentRunner } from './dev-agent-runner.js'
import { resolveConsoleMount } from './serve-console.js'
import { resolveFrontendMount } from './serve-frontend.js'
import { serverReadyLine } from '../../server/server-ready.js'
import { createEphemeralContentSigningJWT } from '../../server/content-signing-jwt.js'
import { disableDevActorSignIn } from '../../server/actor-sign-in.js'
import { applyModelAliasOverride } from '../../utils/model-alias-override.js'

export const serve = pikkuSessionlessFunc<
  { port?: string; console?: boolean; model?: string },
  void
>({
  remote: true,
  func: async (
    { logger, config, getInspectorState, variables, devServerRunner },
    { port, console: serveConsole, model }
  ) => {
    process.env.PIKKU_DEV_QUICK_LOGIN ??= 'true'
    disableDevActorSignIn(logger)
    applyModelAliasOverride(logger, model, config.models)
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

    // Scenario instrumentation exists only on a locally served project: the
    // runner calls it over RPC to reset and snapshot coverage and stub calls.
    // It is registered here, after the app bootstrap, rather than generated
    // into the project — an app bootstrap is what a deployed bundle imports,
    // and coverage endpoints have no business in one.
    if (config.scaffold?.scenarios) {
      registerScenarioInstrumentation()
    }

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
      config.runtimeDir,
      config.db
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
    const contentSigningJWT = localContentConfig
      ? createEphemeralContentSigningJWT()
      : undefined
    const localContent =
      localContentConfig && contentSigningJWT
        ? new LocalContent(localContentConfig, logger, contentSigningJWT)
        : undefined

    const schedulerService = new InMemorySchedulerService()
    const agentStorage = kysely
      ? new KyselyAgentStorageService(kysely as any)
      : undefined
    const agentRunState = kysely
      ? new KyselyAgentRunStateService(kysely as any)
      : new InMemoryAgentRunStateService()
    const agentRunService = kysely
      ? new KyselyAgentRunService(kysely as any)
      : undefined

    if (agentStorage) await agentStorage.init()
    if ('init' in agentRunState && typeof agentRunState.init === 'function') {
      await agentRunState.init()
    }

    const requiredServices = inspectorState.serviceAggregation.requiredServices
    const scopeService =
      kysely && requiredServices.has('scopeService')
        ? new KyselyScopeService(kysely as any)
        : undefined
    if (scopeService) {
      await scopeService.init()
      await scopeService.syncScopes(
        flattenScopeDefinitions(inspectorState.scopes.definitions)
      )
      await scopeService.syncSystemRoles(
        flattenSystemRoleDefinitions(inspectorState.systemRoles.definitions)
      )
    }

    const devLogger = new ConsoleLogger()
    const hasAgents = Object.keys(inspectorState.agents.agentsMeta).length > 0
    const agentRunner =
      hasAgents || requiredServices.has('agentRunner')
        ? await createDevAgentRunner({
            logger,
            projectRoot: config.rootDir,
            variables,
          })
        : undefined

    const eventHub = await devServerRunner.createEventHub()
    const serveQueueService = new InMemoryQueueService()
    const serveWebhookService =
      kysely && requiredServices.has('webhookService')
        ? new KyselyWebhookService(serveQueueService, kysely as any)
        : new QueueWebhookService(serveQueueService)
    if (serveWebhookService instanceof KyselyWebhookService) {
      await serveWebhookService.init()
    }
    const inMemoryServices = {
      logger: devLogger,
      ...(agentRunner ? { agentRunner } : {}),
      emailService: new LocalEmailService(),
      metaService: new LocalMetaService(pikkuDir),
      schedulerService,
      queueService: serveQueueService,
      webhookService: serveWebhookService,
      ...(scopeService ? { scopeService } : {}),
      workflowService,
      workflowRunService: workflowService,
      triggerService: new InMemoryTriggerService(),
      agentStorage,
      agentRunState,
      agentRunService,
      eventHub,
      ...(kysely ? { kysely } : {}),
      ...(localContent ? { content: localContent } : {}),
    }

    const singletonServices = await userCreateSingletonServices(userConfig, {
      ...inMemoryServices,
      getInspectorState,
    })
    const resolvedServices = {
      ...singletonServices,
      getInspectorState,
    }
    pikkuState(null, 'package', 'singletonServices', resolvedServices)
    resolvedServices.workflowService?.wireQueueWorkers?.()
    wireAgentScorerQueueWorkers()

    const { serverLifecycleFactory } = inspectorState.filesAndMethods
    const loadLifecycle = async () => {
      if (!serverLifecycleFactory) return undefined
      const m = await loadUserModule(serverLifecycleFactory.file)
      return m[serverLifecycleFactory.variable]
    }

    const consoleMount = serveConsole ? await resolveConsoleMount() : undefined
    if (serveConsole && !consoleMount) {
      logger.warn(
        'Console app not found. Please rebuild @pikku/cli with the console app bundled.'
      )
    }
    const frontendMount = config.frontend
      ? await resolveFrontendMount(config.frontend)
      : undefined
    // The console goes first so a frontend mounted at `/` cannot claim
    // `/console` before the console's own mount is offered the request.
    const staticMounts = [consoleMount, frontendMount].filter(
      (mount): mount is NonNullable<typeof mount> => Boolean(mount)
    )
    const pikkuServer = devServerRunner.createServer(
      {
        ...userConfig,
        hostname: bindHostname,
        port: resolvedPort,
        content: localContentConfig,
        ...(staticMounts.length ? { staticMounts } : {}),
      },
      logger,
      { contentSigningJWT }
    )

    const lifecycle = await loadLifecycle()

    await pikkuServer.init()
    await lifecycle?.beforeStart?.(resolvedServices)
    await pikkuServer.start()
    await lifecycle?.afterStart?.(resolvedServices)

    // Not `resolvedPort`: `--port 0` asks the OS for a free port, and every URL
    // announced from here has to name the one it actually handed out.
    const boundPort = pikkuServer.port

    if (consoleMount) {
      logger.info(
        `Pikku Console available at http://${hostname}:${boundPort}${consoleMount.urlPrefix}`
      )
    }

    if (frontendMount) {
      logger.info(
        `Frontend available at http://${hostname}:${boundPort}${frontendMount.urlPrefix}`
      )
    }

    logger.info(serverReadyLine(hostname, boundPort))

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
