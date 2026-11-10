import { callUserCreateConfig } from '../../utils/call-user-create-config.js'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'path'
import {
  codegenStateFile,
  collectCodegenPass,
  runCodegenChild,
} from './codegen-child.js'
import { startDevWatch } from './dev-watch.js'
import {
  BACKEND_RELOAD_SIGNAL,
  planDev,
  startDevBackends,
  type RunningBackends,
} from './dev-backends.js'
import { readMcpManifests } from './dev-mcp-manifests.js'

import { pikkuSessionlessFunc } from '#pikku/function'
import type { FSWatcher } from 'chokidar'
import {
  pikkuDevReloader,
  reloadGeneratedMeta,
  reconcileAddonRegistry,
} from '@pikku/core/dev'
import { flattenScopeDefinitions } from '@pikku/core/scope'
import { projectScopeDefinitions } from '../wirings/scopes/pikku-command-scopes.js'
import { flattenSystemRoleDefinitions } from '@pikku/core/role'
import {
  ConsoleLogger,
  InMemoryTriggerSourceStore,
  LocalEmailService,
  spy,
} from '@pikku/core/services'
import { InMemoryWorkflowService } from '@pikku/core/services/in-memory-workflow'
import { stopSingletonServices } from '@pikku/core/utils'
import { composeServerLifecycle } from '@pikku/core/lifecycle'
import { pikkuState } from '@pikku/core/state'
import { wireAgentScorerQueueWorkers } from '@pikku/core/agent-scorer'
import { LocalMetaService } from '@pikku/core/services/local-meta'
import {
  VaultSecretService,
  vaultConnectionFromEnv,
} from '../../utils/vault-secret-service.js'
import { LocalContent } from '@pikku/core/services/local-content'
import { InMemorySchedulerService } from '@pikku/schedule'
import {
  resolveDb,
  createKysely,
  parseDatabaseUrl,
  type ResolvedDb,
} from '../db/local-db.js'
import {
  loadCreateLocalServices,
  loadUserBootstrap,
  loadUserModule,
} from './load-user-project.js'
import { createDevCredentialService } from './dev-credentials.js'
import { loadDevPlatformServices } from './dev-platform-services.js'
import { reconcileDevWebhooks } from './dev-webhook-registrations.js'
import { registerScenarioInstrumentation } from '../wirings/scenarios/register-scenario-instrumentation.js'
import { startCoverageService } from './start-coverage.js'
import { resolveDevEnvironmentName } from './environment.js'
import { createDevAgentRunner } from './dev-agent-runner.js'
import { registerStudioSession } from '../wirings/studio/register-studio-session.js'
import { serverReadyLine } from '../../server/server-ready.js'
import {
  clearDevAddress,
  recordDevCodegen,
  writeDevAddress,
} from './dev-address.js'
import { createEphemeralContentSigningJWT } from '../../server/content-signing-jwt.js'
import {
  backendForContent,
  resolveLocalContentConfig,
} from '../../server/local-content-config.js'
import {
  enableDevVirtualUserSignIn,
  setDevVirtualUserApiUrl,
} from '../../server/virtual-user-sign-in.js'
import { applyModelAliasOverride } from '../../utils/model-alias-override.js'
import { addGlobalMiddleware } from '@pikku/core/middleware'
import { startRunTelemetry } from '../../utils/run-telemetry.js'
import { servedFrontend } from '../../utils/frontend.js'
import {
  betterAuthGeneratedSecrets,
  declaredGeneratedSecrets,
  ensureDevSecrets,
  fillMissing,
  frontendEnv,
  missingRequiredSecrets,
  readEnvFile,
} from './dev-env.js'
import {
  parseFrontendNames,
  selectDevFrontends,
  startDevFrontends,
  type DevFrontend,
  type RunningFrontends,
} from './dev-frontends.js'
import { AUTH_GENERATED_DEV_SECRETS } from '../wirings/auth/serialize-auth-gen.js'

/**
 * `pikku dev` for a project that declares frontends and no backend: run the
 * frontends and nothing else. There is no API for them to proxy to, so
 * VITE_API_PROXY is left as the shell and .env set it.
 */
const runFrontendsOnly = async ({
  frontends,
  shellEnv,
  rootEnv,
  logger,
}: {
  frontends: DevFrontend[]
  shellEnv: NodeJS.ProcessEnv
  rootEnv: Record<string, string>
  logger: { info: (m: string) => void; error: (m: string) => void }
}): Promise<void> => {
  if (frontends.length === 0) {
    throw new Error(
      'pikku dev: this project declares no backends and no frontend with dev.command, so there is nothing to run.'
    )
  }
  const running = await startDevFrontends({
    frontends,
    write: (line) => console.log(line),
    envFor: (frontend) => frontendEnv(shellEnv, rootEnv, frontend.cwd),
  })
  for (const { name, url, primary } of running.urls) {
    logger.info(`  ${name}${primary ? ' (primary)' : ''}: ${url}`)
  }
  const stop = (exitCode: number) => {
    running.stop()
    process.exit(exitCode)
  }
  void running.failure.then(({ name, reason }) => {
    logger.error(`dev: frontend "${name}" ${reason} — stopping`)
    stop(1)
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => stop(0))
  }
  await new Promise(() => {})
}

export const dev = pikkuSessionlessFunc<
  {
    port?: string
    watch?: boolean
    hmr?: boolean
    coverage?: boolean
    test?: boolean
    model?: string
    frontends?: boolean
    frontend?: string
    backend?: string
    serveOnly?: boolean
  },
  void
>({
  remote: true,
  func: async (
    {
      logger,
      config,
      getInspectorState,
      invalidateInspectorState,
      loadInspectorStateFile,
      variables,
      devServerRunner,
    },
    {
      port,
      watch,
      hmr,
      coverage,
      test,
      model,
      frontends,
      frontend,
      backend,
      serveOnly,
    }
  ) => {
    // Which backends this process carries is settled before anything starts, so
    // a bad --backend or a missing dev.port fails in a second, not after codegen.
    const plan = planDev(config, {
      backend,
      port,
      passthrough: {
        config: config.config,
        logLevel: (config as { logLevel?: string }).logLevel,
        coverage,
        test,
        model,
        hmr,
      },
    })
    if (serveOnly && plan.mode !== 'inline') {
      throw new Error('--serveOnly serves one backend; name it with --backend.')
    }
    // Resolve the frontends to run before anything starts, so a typo in
    // --frontend fails in a second rather than after codegen.
    const devFrontends =
      frontends === false
        ? []
        : selectDevFrontends(config.frontends, parseFrontendNames(frontend))
    // What the shell gave us, before any .env is merged in: a frontend's own
    // .env has to be able to override the root one, which it could not if the
    // root values were already indistinguishable from the process's.
    const shellEnv = { ...process.env }
    const rootEnvPath = join(config.rootDir, '.env')
    fillMissing(process.env, readEnvFile(rootEnvPath))
    if (plan.mode === 'frontends') {
      await runFrontendsOnly({
        frontends: devFrontends,
        shellEnv,
        rootEnv: readEnvFile(rootEnvPath),
        logger,
      })
      return
    }
    process.env.PIKKU_ENV ??= resolveDevEnvironmentName(
      config.environments ?? {}
    )
    enableDevVirtualUserSignIn(
      logger,
      config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
    )
    applyModelAliasOverride(logger, model, config.models)
    // A parent only supervises: telemetry and coverage belong to the backend
    // processes it starts, one each.
    const telemetry =
      plan.mode === 'inline'
        ? startRunTelemetry({ rootDir: config.rootDir, command: 'dev' })
        : undefined
    if (test) {
      process.env.PIKKU_TEST_RUN = 'true'
    }
    const coverageService =
      coverage && plan.mode === 'inline'
        ? await startCoverageService(logger, config.rootDir)
        : undefined
    const resolvedPort = plan.mode === 'inline' ? plan.port : 0
    const hostname = 'localhost'
    // Bind on IPv4 loopback explicitly. Under Bun, hostname 'localhost' resolves
    // to IPv6 [::1] only, so a 127.0.0.1 proxy (e.g. the sandbox Caddy) can't
    // reach it. '127.0.0.1' binds IPv4 on both Node and Bun (Node otherwise
    // relies on --dns-result-order=ipv4first for the same effect). `hostname`
    // stays 'localhost' for the user-facing content URL below.
    const bindHostname = '127.0.0.1'
    // A backend process never watches: its parent runs codegen and signals it.
    const enableWatch = watch !== false && !serveOnly
    const enableHmr = hmr !== false
    const watchDirectories = [
      ...new Set(
        [config.emailTemplatesDir, ...config.srcDirectories].filter(Boolean)
      ),
    ] as string[]
    const workflowService = new InMemoryWorkflowService()
    // `sharedDir` is the unfiltered tree codegen writes first. A process that
    // serves a named backend loads that backend's own filtered tree instead.
    const sharedDir = resolve(config.rootDir, config.outDir)
    const resolvedRuntimeDir =
      config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
    const servedBackend = plan.mode === 'inline' ? plan.backend : undefined
    const pikkuDir = servedBackend
      ? join(sharedDir, 'backends', servedBackend)
      : sharedDir
    const runCodegen = async (diagnosticsFile?: string) => {
      const stateFile = codegenStateFile()
      try {
        await runCodegenChild(stateFile, {
          command: ['all'],
          backend: servedBackend,
          config: config.config,
          outDir: config.outDir,
          logLevel: (config as { logLevel?: string }).logLevel,
          output: (config as { output?: string }).output,
          security: (config as { security?: boolean }).security,
          inheritStdout: true,
          diagnosticsFile,
        })
        await loadInspectorStateFile(stateFile)
      } finally {
        await rm(stateFile, { force: true })
      }
    }

    const startupCodegenStartedAt = Date.now()
    // Collected so the watch loop starts from what this pass reported: a
    // nonfatal error must not read as ok because nothing changed since.
    let startupFailure: { error: unknown } | undefined
    const startupPass = serveOnly
      ? undefined
      : await collectCodegenPass(async (diagnosticsFile) => {
          try {
            await runCodegen(diagnosticsFile)
          } catch (error) {
            startupFailure = { error }
            throw error
          }
        })
    if (startupFailure) throw startupFailure.error

    const inspectorState = await getInspectorState()

    // Secrets are created here, after codegen has said what the app declares
    // and before anything reads them: the services below and every frontend
    // child see the same values.
    const generatedSecrets = [
      ...(inspectorState.auth.definition
        ? betterAuthGeneratedSecrets(AUTH_GENERATED_DEV_SECRETS)
        : []),
      ...declaredGeneratedSecrets(inspectorState.secrets.definitions),
    ]
    const generatedNames = ensureDevSecrets(rootEnvPath, generatedSecrets)
    if (generatedNames.length > 0) {
      logger.info(`dev: generated ${generatedNames.join(', ')} in .env`)
    }
    fillMissing(process.env, readEnvFile(rootEnvPath))
    // A vault holds secrets that never appear in .env, so there is nothing to
    // say about them here.
    for (const name of vaultConnectionFromEnv()
      ? []
      : missingRequiredSecrets(
          inspectorState.secrets.definitions,
          process.env,
          generatedSecrets
        )) {
      logger.warn(
        `dev: required secret ${name} is not set — add ${name}=... to .env or export it before running pikku dev`
      )
    }
    let watcher: FSWatcher | undefined
    let runningFrontends: RunningFrontends | undefined
    let runningBackends: RunningBackends | undefined

    // Starts the frontends beside the API(s) and ties their lifetime to ours.
    // Returns false when one failed to come up (everything is already stopping).
    const launchFrontends = async (
      apiUrl: string,
      shutdown: (exitCode: number) => Promise<void>
    ): Promise<boolean> => {
      if (devFrontends.length === 0) return true
      const rootEnv = readEnvFile(rootEnvPath)
      try {
        runningFrontends = await startDevFrontends({
          frontends: devFrontends,
          write: (line) => console.log(line),
          envFor: (frontend) => {
            const env = frontendEnv(shellEnv, rootEnv, frontend.cwd)
            env.VITE_API_PROXY ??= apiUrl
            return env
          },
        })
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error))
        await shutdown(1)
        return false
      }
      for (const { name, url, primary } of runningFrontends.urls) {
        logger.info(`  ${name}${primary ? ' (primary)' : ''}: ${url}`)
      }
      void runningFrontends.failure.then(({ name, reason }) => {
        logger.error(`dev: frontend "${name}" ${reason} — stopping everything`)
        return shutdown(1)
      })
      return true
    }

    if (plan.mode === 'parent') {
      // Codegen already ran once (shared tree, then one tree per backend). From
      // here this process only watches and supervises.
      const shutdownParent = async (exitCode: number) => {
        runningFrontends?.stop()
        await runningBackends?.stop()
        await watcher?.close()
        clearDevAddress(resolvedRuntimeDir)
        process.exit(exitCode)
      }
      try {
        runningBackends = await startDevBackends({
          processes: plan.processes,
          cwd: config.rootDir,
          write: (line) => console.log(line),
        })
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
      void runningBackends.failure.then(({ name, reason }) => {
        logger.error(`dev: backend "${name}" ${reason} — stopping everything`)
        return shutdownParent(1)
      })
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          logger.info('Stopping dev servers...')
          void shutdownParent(0)
        })
      }
      // The first declared backend is the one frontends proxy to, as the first
      // backend of the local environment is for the port; VITE_API_PROXY in the
      // environment overrides it.
      const primary = plan.processes[0]!
      const primaryUrl = `http://${hostname}:${primary.port}`
      logger.info(
        plan.processes
          .map((p) => `${p.name}: http://${hostname}:${p.port}`)
          .join('\n')
      )
      writeDevAddress(resolvedRuntimeDir, primaryUrl)
      process.once('exit', () => clearDevAddress(resolvedRuntimeDir))
      if (!(await launchFrontends(primaryUrl, shutdownParent))) return
      if (enableWatch && startupPass) {
        watcher = startDevWatch({
          config,
          logger,
          watchDirectories,
          pikkuDir: sharedDir,
          startupPass,
          startupCodegenStartedAt,
          regenerate: async (diagnosticsFile: string) => {
            try {
              const start = Date.now()
              await runCodegen(diagnosticsFile)
              runningBackends?.reload()
              logger.info({
                message: `✓ Generated in ${Date.now() - start}ms`,
                type: 'timing',
              })
              recordDevCodegen(resolvedRuntimeDir, { ok: true })
            } catch (err) {
              logger.error(`Error running watch: ${err}`)
              recordDevCodegen(resolvedRuntimeDir, {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              })
              throw err
            }
          },
        })
      }
      await new Promise(() => {})
      return
    }

    const { pikkuConfigFactory, singletonServicesFactory } =
      inspectorState.filesAndMethods

    if (!pikkuConfigFactory || !singletonServicesFactory) {
      logger.error(
        'createConfig and createSingletonServices must be defined in your project'
      )
      return
    }

    await loadUserBootstrap(pikkuDir)
    if (telemetry?.middleware) addGlobalMiddleware([telemetry.middleware])

    // Scenario instrumentation exists only on a development server: the runner
    // calls it over RPC to reset and snapshot coverage and stub calls. It is
    // registered here, after the app bootstrap, rather than generated into the
    // project — an app bootstrap is what a deployed bundle imports, and coverage
    // endpoints have no business in one.
    if (config.scaffold?.scenarios) {
      registerScenarioInstrumentation()
    }
    registerStudioSession()

    const configModule = await loadUserModule(pikkuConfigFactory.file)
    const servicesModule = await loadUserModule(singletonServicesFactory.file)
    const userCreateConfig = configModule[pikkuConfigFactory.variable]
    const userCreateSingletonServices =
      servicesModule[singletonServicesFactory.variable]

    const userConfig = await callUserCreateConfig(userCreateConfig, variables)

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

    const localContentConfig = resolveLocalContentConfig({
      appContent: userConfig.content,
      rootContent: config.content,
      backendContent: backendForContent(
        config.backends,
        config.backend,
        'pikku dev'
      ).content,
      rootDir: config.rootDir,
      runtimeDir: config.runtimeDir,
      server: `http://${hostname}:${resolvedPort}`,
    })
    const contentSigningJWT = createEphemeralContentSigningJWT()
    const localContent = new LocalContent(
      localContentConfig,
      logger,
      contentSigningJWT
    )

    const requiredServices = inspectorState.serviceAggregation.requiredServices

    // Deployed agent units get their runner from the bundler; the dev server
    // has no equivalent, so construct one from env or agents 503 with
    // AIProviderNotConfiguredError. The template forwards injected services
    // (`...existingServices`) so this reaches getSingletonServices().
    // Only when the project actually reaches for one — a declared agent, or a
    // function destructuring `agentRunner` for a one-shot vision / speech call.
    // Otherwise the runner's missing-SDK warning fires spuriously for every
    // project that happens to have AI env set.
    const hasAgents = Object.keys(inspectorState.agents.agentsMeta).length > 0
    const agentRunner =
      hasAgents || requiredServices.has('agentRunner')
        ? await createDevAgentRunner({
            logger,
            projectRoot: config.rootDir,
            variables,
          })
        : undefined
    const credentialService = await createDevCredentialService({
      kysely,
      runtimeDir: resolvedRuntimeDir,
      logger,
      expectsCredentials:
        requiredServices.has('credentialService') ||
        inspectorState.credentials.definitions.length > 0 ||
        inspectorState.rpc.wireAddonDeclarations.size > 0,
    })

    const vaultConnection = vaultConnectionFromEnv()
    const vaultSecrets = vaultConnection
      ? new VaultSecretService(vaultConnection)
      : undefined

    const createLocalServices = await loadCreateLocalServices(
      config.rootDir,
      config.localServicesFile
    )
    // Only what the dev server alone has is passed in: the database it opened
    // (so sqlite extensions and embedded postgres apply), its event hub,
    // content store and credentials, the workflow service codegen already runs
    // through, and the gates read off the live inspector rather than the ones
    // baked in at the last codegen.
    const baseLocalServices = await createLocalServices(
      userConfig,
      {
        kysely: kysely ?? null,
        logger: new ConsoleLogger(),
        ...(vaultSecrets ? { secrets: vaultSecrets } : {}),
        ...(agentRunner ? { agentRunner } : {}),
        ...(test
          ? { emailService: spy('emailService', new LocalEmailService()) }
          : {}),
        metaService: new LocalMetaService(pikkuDir),
        ...(coverageService ? { coverageService } : {}),
        schedulerService: new InMemorySchedulerService(),
        triggerSourceStore: new InMemoryTriggerSourceStore(),
        workflowService,
        workflowRunService: workflowService,
        credentialService,
        // The dev server runner (node http+ws, or bun-server) is resolved by
        // DI in services.ts. Its EventHub is shared into the singleton
        // services so function-side broadcasts reach the sockets the
        // transport holds.
        eventHub: await devServerRunner.createEventHub(),
        content: localContent,
        getInspectorState,
      },
      {
        logger,
        requiredServices,
        scopes: flattenScopeDefinitions(
          projectScopeDefinitions(inspectorState, config)
        ),
        systemRoles: flattenSystemRoleDefinitions(
          inspectorState.systemRoles.definitions
        ),
      }
    )

    const {
      services: localServices,
      startHooks,
      stopHooks,
    } = await loadDevPlatformServices(
      baseLocalServices,
      config.rootDir,
      config.devContributorsFile,
      process.env
    )

    const singletonServices = await userCreateSingletonServices(
      userConfig,
      localServices
    )
    const resolvedServices = {
      ...singletonServices,
      getInspectorState,
      ...(coverageService ? { coverageService } : {}),
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

    const staticMounts = userConfig.staticMounts ?? []

    /**
     * Hand the server the generated MCP manifests so it actually serves MCP.
     *
     * Codegen reports "N MCP endpoints" and both transports mount them at
     * `mcpPath` — but only when given the manifest, and dev never passed it.
     *
     * They go in the runner *options*, not in the config: the transport reads
     * them off its third argument, and the runners forward a hand-picked list
     * of fields. Putting them in `config` type-checks and is discarded in
     * silence. So every pikku app announced an MCP surface at startup and
     * served a 404, and the only way to exercise a tool was to deploy.
     */
    const { mcpJson, mcpSurfaces } = readMcpManifests(pikkuDir, (message) =>
      logger.warn(message)
    )

    const pikkuServer = devServerRunner.createServer(
      {
        ...userConfig,
        hostname: bindHostname,
        port: resolvedPort,
        content: localContentConfig,
        ...(staticMounts.length > 0 ? { staticMounts } : {}),
      },
      logger,
      { contentSigningJWT, mcpJson, mcpSurfaces }
    )

    const lifecycle = composeServerLifecycle(await loadLifecycle(), {
      start: startHooks,
      stop: stopHooks,
    })

    await pikkuServer.init()
    await lifecycle.beforeStart?.(resolvedServices)
    await pikkuServer.start()
    await lifecycle.afterStart?.(resolvedServices)
    resolvedServices.workflowService?.startRecovery?.(
      userConfig.workflow?.recovery
    )

    // Not `resolvedPort`: `--port 0` asks the OS for a free port, and every URL
    // announced from here has to name the one it actually handed out.
    const boundPort = pikkuServer.port

    // Serving the built frontend here would hand you whatever the last build
    // produced, with no HMR and no warning that it is stale. The frontend's own
    // dev server owns dev; it proxies its API calls back to this port.
    if (servedFrontend(config.frontends) && devFrontends.length === 0) {
      logger.info(
        `Frontend not served in dev — run your frontend dev server and proxy its API calls to http://${hostname}:${boundPort}`
      )
    }

    logger.info(serverReadyLine(hostname, boundPort))

    // After start, not before: some providers probe the URL before they accept it.
    await reconcileDevWebhooks({
      configDir: config.configDir,
      logger,
      singletonServices: resolvedServices,
    }).catch((error) =>
      logger.warn(
        `Webhook sources were not registered: ${error instanceof Error ? error.message : String(error)}`
      )
    )

    // Written from the bound port, so anything that has to find this server later
    // reads where it actually is rather than where it was asked to be.
    // A backend process leaves the address to its parent, which is the pid that
    // `pikku dev status` and the watcher wake-up have to reach.
    if (!serveOnly) {
      writeDevAddress(resolvedRuntimeDir, `http://${hostname}:${boundPort}`)
      process.once('exit', () => clearDevAddress(resolvedRuntimeDir))
    }
    const environmentBackends =
      config.environments?.[process.env.PIKKU_ENV ?? '']?.backends ?? {}
    setDevVirtualUserApiUrl(
      `http://${hostname}:${boundPort}`,
      (servedBackend
        ? environmentBackends[servedBackend]
        : Object.values(environmentBackends)[0]
      )?.url
    )

    const shutdown = async (exitCode: number) => {
      runningFrontends?.stop()
      try {
        resolvedServices.workflowService?.stopRecovery?.()
        await lifecycle.beforeStop?.(resolvedServices)
        await stopSingletonServices()
        await watcher?.close()
        await pikkuServer.stop()
        await lifecycle.afterStop?.(resolvedServices)
      } catch (error) {
        logger.error(
          `Error stopping dev server: ${error instanceof Error ? error.message : String(error)}`
        )
      } finally {
        if (!serveOnly) clearDevAddress(resolvedRuntimeDir)
        process.exit(exitCode)
      }
    }
    // Fire-and-forget signal handler: the finally block always exits the process,
    // so there is no caller to propagate a rejection to.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        logger.info('Stopping dev server...')
        void shutdown(0)
      })
    }

    if (!(await launchFrontends(`http://${hostname}:${boundPort}`, shutdown))) {
      return
    }

    const devReloader = enableHmr
      ? await pikkuDevReloader({
          srcDirectories: watchDirectories,
          logger,
        })
      : undefined

    // What follows a codegen pass in a running server: the new meta and schemas
    // are pulled in, and changed wiring files are registered again.
    const reloadServed = async (freshInspection: boolean) => {
      workflowService.wireQueueWorkers()
      wireAgentScorerQueueWorkers()
      // Pull the regenerated meta + JSON schemas into the running
      // process so new/changed functions are callable without a
      // restart (the hot-reloader registers their implementations).
      await reloadGeneratedMeta({
        pikkuDir,
        logger,
        schemaService: resolvedServices.schema,
      })
      // Re-import recently changed files now that the fresh meta is
      // in state: wire* calls skip routes whose meta doesn't exist,
      // so a NEW route in a changed wiring file only registers on
      // this post-codegen pass (the reloader's instant pass ran too
      // early to see it).
      await devReloader?.reimportPending()
      // reimportPending only re-runs wire* for changed/added files, so a
      // DELETED *.addon.ts leaves its wireAddon entry stranded in the
      // live registry. Prune it against the inspection. Where this process ran
      // the codegen, a plain read reuses the fresh cache (refreshing would
      // inspect the whole project a SECOND time); a backend process did not,
      // so it inspects again.
      if (freshInspection) invalidateInspectorState()
      const { rpc } = await getInspectorState(freshInspection)
      reconcileAddonRegistry(rpc.wireAddonDeclarations.keys(), logger)
    }

    if (serveOnly) {
      // The parent finished a codegen pass: load what it wrote.
      process.on(BACKEND_RELOAD_SIGNAL, () => {
        void reloadServed(true).then(
          () => logger.info('✓ Reloaded generated code'),
          (error) => logger.error(`Error reloading generated code: ${error}`)
        )
      })
    }

    if (enableWatch && startupPass) {
      watcher = startDevWatch({
        config,
        logger,
        watchDirectories,
        pikkuDir: sharedDir,
        startupPass,
        startupCodegenStartedAt,
        regenerate: async (diagnosticsFile: string) => {
          try {
            const start = Date.now()
            await runCodegen(diagnosticsFile)
            await reloadServed(false)
            logger.info({
              message: `✓ Generated in ${Date.now() - start}ms`,
              type: 'timing',
            })
            recordDevCodegen(resolvedRuntimeDir, { ok: true })
          } catch (err) {
            logger.error(`Error running watch: ${err}`)
            recordDevCodegen(resolvedRuntimeDir, {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            })
            throw err
          }
        },
      })
    }

    await new Promise(() => {})
  },
})
