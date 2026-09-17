import { randomUUID } from 'node:crypto'
import { resolve, join, dirname, relative, sep } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { glob } from 'tinyglobby'

import { pikkuSessionlessFunc } from '#pikku/function'
import { InMemoryWorkflowService } from '@pikku/core/services'
import { FileScenarioRunStore } from '@pikku/core/services'
import { createHttpPersonas } from '@pikku/core/persona'
import {
  PikkuScenarioService,
  resolveFeatureScenarios,
  SCENARIO_SURFACES,
} from '@pikku/core/scenario'
import { pikkuState, getAllPackageStates } from '@pikku/core/state'
import type { PikkuRPC } from '@pikku/core/rpc'
import type { CoreWorkflow } from '@pikku/core/workflow'
import type { CoreFeature, ScenarioSurface } from '@pikku/core/scenario'

import { loadScenarioBootstrap } from './load-user-project.js'
import {
  collectScenarioStepProse,
  scenarioBrowserSteps,
  scenarioFailureFromSteps,
  scenarioStepRows,
  scenarioStepsWithoutBinding,
  scenarioSurfaceCoverage,
} from './scenario-ladder.js'
import { formatScenarioReport } from './scenario-formatter.js'
import type {
  ScenarioFailureDetail,
  ScenarioResult,
  ScenarioRunSelection,
} from '@pikku/core/scenario'
import {
  resolveScenarioBrowserProvider,
  scenarioBrowserLifecycle,
} from './scenario-browser.js'
import { resolvePersonas } from '../../utils/resolve-personas.js'
import { resolvePersonaCredentials } from '../../utils/persona-credentials.js'
import { spawnDevServer } from '../../server/spawn-dev-server.js'
import {
  checkGuideCoverage,
  featureEvidence,
  guideStep,
  parseGuideLock,
  parseGuidePage,
  renderGuideLock,
  renderGuidePage,
} from './scenario-guide.js'
import type { GuideFeature, GuideLock, GuidePage } from './scenario-guide.js'
import { buildScenarioPlan, identifyScenarioResult } from './scenario-plan.js'
import { resolveScenarioRunVersion } from './scenario-version.js'
import type { ScenarioPlanGroup, ScenarioRunIdentity } from './scenario-plan.js'
import { resolveEnvironment, isLocalUrl } from './environment.js'
import { readDevAddress } from './dev-address.js'
import type { ScenarioBaseline } from '../db/scenario-baseline.js'
import { createDevAgentRunner } from './dev-agent-runner.js'

const isScenario = (wf: any) => wf?.scenario === true

const listScenarios = (state: any) =>
  Object.entries(state.workflows?.meta ?? {})
    .filter(([, wf]) => isScenario(wf))
    .map(([id, wf]: [string, any]) => ({
      id,
      name: wf.name ?? id,
      description: wf.description ?? wf.summary ?? wf.title ?? null,
      tags: wf.tags ?? [],
      skip: wf.skip as string | undefined,
    }))

/**
 * Features and scenario registrations, merged across the main package and any
 * addon packages. A feature holds the very config objects the registrations
 * hold, which is what makes membership resolvable by identity.
 */
const collectRegisteredWirings = () => {
  const features = new Map<string, CoreFeature>()
  const registrations = new Map<string, CoreWorkflow>()
  for (const [packageName] of getAllPackageStates()) {
    const scope = packageName === '__main__' ? null : packageName
    for (const [id, feature] of pikkuState(scope, 'workflows', 'features')) {
      features.set(id, feature)
    }
    for (const [name, registration] of pikkuState(
      scope,
      'workflows',
      'registrations'
    )) {
      registrations.set(name, registration)
    }
  }
  return { features, registrations }
}

export const scenarioList = pikkuSessionlessFunc<{}, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState(false, false, false, true)
    const flows = listScenarios(state)
    if (flows.length === 0) {
      logger.info('No scenarios found (pikkuScenario exports).')
      return
    }

    await loadScenarioBootstrap(resolve(config.rootDir, config.outDir))
    const { features, registrations } = collectRegisteredWirings()
    const { entries, unresolved } = resolveFeatureScenarios(
      features,
      registrations
    )
    for (const { featureId, index } of unresolved) {
      logger.error(
        `Feature '${featureId}' scenario #${index} is not a registered scenario — it will not run.`
      )
    }

    const describe = (name: string) =>
      flows.find((flow) => flow.name === name)?.description

    for (const [featureId, feature] of features) {
      const featureTags = feature.tags?.length
        ? `  [${feature.tags.join(', ')}]`
        : ''
      logger.info(`${feature.name ?? featureId}${featureTags}`)
      if (feature.description) {
        logger.info(`  ${feature.description}`)
      }
      for (const entry of entries.filter((e) => e.featureId === featureId)) {
        const data = entry.data ? ` ${JSON.stringify(entry.data)}` : ''
        logger.info(`  - ${entry.scenarioName}${data}`)
      }
    }

    const inAFeature = new Set(entries.map((entry) => entry.scenarioName))
    for (const flow of flows) {
      if (inAFeature.has(flow.name)) continue
      const tags = flow.tags.length ? `  [${flow.tags.join(', ')}]` : ''
      logger.info(`${flow.name}${tags}`)
      const description = describe(flow.name)
      if (description) {
        logger.info(`  ${description}`)
      }
    }
  },
})

export const scenarioRun = pikkuSessionlessFunc<
  {
    environment: string
    flows?: string
    features?: string
    tags?: string
    excludeTags?: string
    coverage?: boolean
    run?: ScenarioSurface
    strict?: boolean
    spawn?: boolean
    keepAlive?: boolean
    trace?: boolean
    screenshots?: boolean
    video?: 'off' | 'failed' | 'all'
    apiUrl?: string
    appUrl?: string
  },
  void
>({
  func: async (
    { logger, config, getInspectorState, variables },
    {
      environment,
      flows,
      features,
      tags,
      excludeTags,
      coverage,
      run: runSurface = 'default',
      strict = false,
      spawn = false,
      keepAlive = false,
      trace = false,
      screenshots = false,
      video = 'failed',
      apiUrl,
      appUrl,
    }
  ) => {
    if (!SCENARIO_SURFACES.includes(runSurface)) {
      throw new Error(
        `Unknown --run surface '${runSurface}'. Expected one of: ${SCENARIO_SURFACES.join(', ')}.`
      )
    }
    const state = await getInspectorState(true, false, false, true)

    // Resolved once, so actors, step env, the browser driver and any spawned
    // server all target the same place — including when the target only exists
    // at run time and arrives through --api-url/--app-url.
    const env = resolveEnvironment({
      environment,
      environments: config.environments ?? {},
      apiUrl,
      appUrl,
      spawn,
    })
    if (apiUrl || appUrl) {
      logger.info(
        `Overriding '${environment}': apiUrl ${env.apiUrl}${env.appUrl ? `, appUrl ${env.appUrl}` : ''}`
      )
    }

    // A dev server that could not take the port it was asked for is the ordinary
    // way a run against a configured environment meets a connection refused, and
    // nothing in the failure says so. Said here, once, with the flag that fixes it.
    if (!apiUrl && !spawn) {
      const running = readDevAddress(
        config.runtimeDir ?? join(config.rootDir, '.pikku-runtime')
      )
      if (running && running.apiUrl !== env.apiUrl) {
        logger.warn(
          `A \`pikku dev\` is serving ${running.apiUrl}, but '${environment}' targets ${env.apiUrl}. ` +
            `Run against the one that is up with --api-url ${running.apiUrl}, or let this command start its own with --spawn.`
        )
      }
    }

    if (spawn) {
      const { hostname, port } = new URL(env.apiUrl)
      const resolvedPort = Number(port || 80)
      logger.info(`Starting a server for '${environment}' on ${env.apiUrl}`)
      const server = await spawnDevServer({
        cwd: config.rootDir,
        port: resolvedPort,
        hostname,
        coverage,
        env: { API_URL: env.apiUrl },
        onOutput: (text) => process.stdout.write(text),
      })
      // Registered rather than wrapped in a try/finally: the run below sets
      // process.exitCode and can throw, and an exit handler covers both without
      // the whole command body having to nest inside one block.
      if (!keepAlive) {
        process.once('exit', server.stop)
        process.once('SIGINT', () => {
          server.stop()
          process.exit(1)
        })
        process.once('SIGTERM', () => {
          server.stop()
          process.exit(1)
        })
      }
      await server.waitUntilReady()
    }

    // Features live in runtime state, not inspector meta — their scenario lists
    // may be built by an ordinary loop — so the project has to be loaded before
    // anything can be selected.
    await loadScenarioBootstrap(resolve(config.rootDir, config.outDir))
    const { features: registeredFeatures, registrations } =
      collectRegisteredWirings()

    const split = (value?: string) =>
      value ? value.split(',').map((part) => part.trim()) : undefined

    let { groups, unresolved } = buildScenarioPlan({
      scenarios: listScenarios(state).map(({ name, tags: flowTags, skip }) => ({
        name,
        tags: flowTags,
        skip,
      })),
      features: registeredFeatures,
      registrations,
      flows: split(flows),
      featureIds: split(features),
      tags: split(tags),
      excludeTags: split(excludeTags),
    })

    if (unresolved.length > 0) {
      for (const { featureId, index } of unresolved) {
        logger.error(
          `Feature '${featureId}' scenario #${index} is not a registered scenario. ` +
            `A feature references scenarios by imported identifier — a scenario built inline inside a feature is never registered.`
        )
      }
      process.exitCode = 1
      return
    }

    if (groups.length === 0) {
      logger.error('No scenarios matched.')
      process.exitCode = 1
      return
    }

    const credentials = await resolvePersonaCredentials(
      variables,
      'scenario actors'
    )
    // Every declared persona, with its address filled in. Resolved once: the
    // HTTP personas and the Playwright provider below must see the same
    // registry, and codegen resolved the same way to type `PersonaName`.
    const scenarioActors = resolvePersonas(
      state.personas?.definitions ?? [],
      config.scenarios?.emailDomain
    )
    const actors = createHttpPersonas({
      apiUrl: env.apiUrl,
      ...credentials,
      personas: scenarioActors,
      signInPath: env.signInPath,
      sessionPath: env.sessionPath,
      rpcPath: env.rpcPath,
      model: config.scenarios?.model,
    })

    const functionsMeta = state.functions?.meta ?? {}
    const scenarioNames = new Set(
      groups.flatMap((group) => group.entries.map((e) => e.scenarioName))
    )
    const browserStepsByFlow = new Map<string, string[]>(
      [...scenarioNames]
        .map(
          (name) =>
            [
              name,
              scenarioBrowserSteps(
                state.workflows?.meta?.[name],
                functionsMeta
              ),
            ] as const
        )
        .filter(([, steps]) => steps.length > 0)
    )
    const unrunnableStepsByFlow = new Map<string, string[]>(
      [...scenarioNames]
        .map(
          (name) =>
            [
              name,
              scenarioStepsWithoutBinding(
                state.workflows?.meta?.[name],
                functionsMeta,
                runSurface
              ),
            ] as const
        )
        .filter(([, steps]) => steps.length > 0)
    )

    // A `skip` is the project quarantining a scenario on purpose and stays
    // green; no binding for the run surface is a misconfigured run and fails.
    const quarantined: Array<{ name: string; reason: string }> = []
    const unrunnable: Array<{ name: string; reason: string }> = []
    groups = groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          if (entry.skip) {
            quarantined.push({ name: entry.scenarioName, reason: entry.skip })
            return false
          }
          const steps = unrunnableStepsByFlow.get(entry.scenarioName)
          if (steps?.length) {
            unrunnable.push({
              name: entry.scenarioName,
              reason: `no ${runSurface} or default binding: ${steps.join(', ')}`,
            })
            return false
          }
          return true
        }),
      }))
      .filter((group) => group.entries.length > 0)
    const skipped = [...quarantined, ...unrunnable]

    const workflowService = new InMemoryWorkflowService()
    const scenarioService = workflowService.setRunExtension(
      (engine) => new PikkuScenarioService(engine)
    )
    scenarioService.setScenarioEnvironment({
      apiUrl: env.apiUrl,
      appUrl: env.appUrl,
    })
    scenarioService.setRunSurface(runSurface, strict)

    // Scenario steps run here, not on the target — everything they touch of the
    // app goes over HTTP through an actor, which is what `guardRpc` below
    // enforces. `actor.converse` is the exception, and the reason this is not
    // just the three services above: the persona's own turns are LLM calls made
    // in this process, and without a runner every conversing scenario fails
    // before it says anything. Built the same way `pikku dev` builds its own,
    // and only when the project declares agents, so a project with no agents
    // does not have to have AI env set to run scenarios.
    const agentRunner =
      Object.keys(state.agents?.agentsMeta ?? {}).length > 0
        ? await createDevAgentRunner({
            logger,
            projectRoot: config.rootDir,
            variables,
          })
        : undefined
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      workflowService,
      workflowRunService: workflowService,
      ...(agentRunner ? { agentRunner } : {}),
    } as any)
    const refuseInternal = (rpcName: string): never => {
      throw new Error(
        `Scenario tried to run '${rpcName}' as an internal step. Every workflow.do ` +
          `in a scenario must carry { actor: actors.x } so it executes against ` +
          `'${environment}' (${env.apiUrl}), not local services.`
      )
    }
    // `rpcWithWire` is named alongside `PikkuRPC` rather than left to it: the
    // workflow runner reaches for that member through an internally untyped
    // path, so it is the one the guard actually has to answer, and the type
    // that declares it publicly arrives later in this stack.
    const guardRpc: PikkuRPC & {
      rpcWithWire: (rpcName: string) => Promise<never>
    } = {
      depth: 0,
      global: false,
      invoke: async (rpcName: string) => refuseInternal(rpcName),
      remote: async (rpcName: string) => refuseInternal(rpcName),
      exposed: async (rpcName: string) => refuseInternal(rpcName),
      rpcWithWire: async (rpcName: string) => refuseInternal(rpcName),
      startWorkflow: async (name: string) => refuseInternal(name),
      agent: {
        run: async (name: string) => refuseInternal(name),
        stream: async (name: string) => refuseInternal(name),
        resume: async (runId: string) => refuseInternal(runId),
        approve: async (runId: string) => refuseInternal(runId),
        interrupt: async (runId: string) => refuseInternal(runId),
      },
    }

    // Only a browser run launches one. Under `--run default` a step with a
    // browser binding takes its default path instead, so there is nothing to
    // drive and nothing to pay for.
    const needsBrowser =
      runSurface === 'browser' &&
      groups.some((group) =>
        group.entries.some((entry) =>
          browserStepsByFlow.has(entry.scenarioName)
        )
      )
    // Artifacts are filed under the run, not the scenario, so one run's output
    // is one folder to open, keep or delete.
    const captureDir = join(
      resolve(config.rootDir, config.outDir),
      'scenario-runs'
    )
    // One id for the whole invocation, distinct from a scenario's own runId:
    // reviewing artifacts means opening what `pikku scenario run` just produced,
    // not hunting for one scenario's folder among many.
    const captureRunId = randomUUID()
    const capture = {
      dir: captureDir,
      runId: captureRunId,
      screenshots,
      video,
      compress: true,
    }
    const browserLifecycle = scenarioBrowserLifecycle(
      needsBrowser
        ? await (async () => {
            const provider = await resolveScenarioBrowserProvider({
              environment,
              apiUrl: env.apiUrl,
              appUrl: env.appUrl,
              appUrls: env.appUrls,
              ...credentials,
              actors: scenarioActors,
              signInPath: env.signInPath,
              capture,
              browserScenarios: [...browserStepsByFlow.keys()],
              driver: config.scenarios?.browserDriver,
            })
            scenarioService.setScenarioBrowserProvider(provider)
            return provider
          })()
        : undefined
    )

    // Captured once, from the migrated and seeded database the suite was
    // pointed at, and replayed before every scenario below. The project's own
    // code has no part in it: a scenario reset is the runner reaching into a
    // local database, never an RPC the deployed bundle carries.
    let databaseBaseline: ScenarioBaseline | undefined
    if (config.scenarios?.reset?.enabled) {
      if (env.production) {
        throw new Error(
          `scenarios.reset is on and '${environment}' is marked production. A reset replaces its rows with seed data; it will not run against one.`
        )
      }
      if (!isLocalUrl(env.apiUrl)) {
        throw new Error(
          `scenarios.reset is on but '${environment}' targets ${env.apiUrl}. The reset works on the database directly, so it only runs against a server on this machine.`
        )
      }
      // Imported here rather than at the top because the db stack statically
      // pulls in kysely and better-auth, which a project running scenarios
      // without this feature has no reason to have installed.
      const { loadUserConfigForDb } = await import('./db-shared.js')
      const { resolveDb } = await import('../db/local-db.js')
      const { captureScenarioBaseline } =
        await import('../db/scenario-baseline.js')
      const userConfig = await loadUserConfigForDb({ config, logger })
      const resolved =
        userConfig &&
        resolveDb(
          userConfig,
          config.rootDir,
          config.outDir,
          config.runtimeDir,
          config.db
        )
      if (!resolved) {
        throw new Error(
          `scenarios.reset is on but no database is configured — set sqliteDb or postgresUrl in your createConfig.`
        )
      }
      databaseBaseline = await captureScenarioBaseline(
        resolved,
        config.scenarios.reset
      )
      logger.info(
        `scenario reset: captured ${databaseBaseline.tables.length} tables as the per-scenario baseline`
      )
    }

    const results: ScenarioResult[] = []

    // Opened before the first scenario and written to as each one finishes, so
    // a suite that dies on its fortieth still leaves the thirty-nine behind —
    // and the console can show a run while it is still going.
    const runStore = new FileScenarioRunStore({ dir: captureDir })
    const startedAtIso = new Date().toISOString()
    const version = await resolveScenarioRunVersion(runStore, config.rootDir)
    try {
      const selection: ScenarioRunSelection = {
        ...(split(flows) ? { flows: split(flows) } : {}),
        ...(split(features) ? { features: split(features) } : {}),
        ...(split(tags) ? { tags: split(tags) } : {}),
        ...(split(excludeTags) ? { excludeTags: split(excludeTags) } : {}),
      }

      await runStore.start({
        runId: captureRunId,
        environment,
        surface: runSurface,
        version,
        status: 'running',
        ...(Object.keys(selection).length > 0 ? { selection } : {}),
        startedAt: startedAtIso,
        results: [],
        skipped,
        hookFailures: [],
      })

      /**
       * The step ladder is read back off the recorded run, so it needs no live
       * step events — it is the same data the console renders. Joining it to the
       * declared prose happens here, where the inspector state is; laying it out
       * is the formatter's job.
       */
      const readRunSteps = async (
        service: InMemoryWorkflowService,
        runId: string,
        flowName: string
      ) => {
        // Taken from the run rather than derived from the ladder: the video
        // clock starts when an actor's window opens, which is somewhere after
        // step one, and every step that never touched a browser burns scenario
        // time while the recording sits still.
        const videoOffsets = scenarioService.takeStepVideoOffsets(runId)
        const prose = collectScenarioStepProse(
          state.workflows?.meta?.[flowName],
          functionsMeta,
          state.personas?.definitions ?? []
        )
        const steps = (await service.getRunSteps(runId)).map((step) => ({
          stepName: step.stepName,
          status: step.status,
          durationMs: step.succeededAt
            ? step.succeededAt.getTime() - step.createdAt.getTime()
            : undefined,
          error: step.error?.message,
          stack: step.error?.stack,
          expected: step.error?.expected,
          input: step.data,
          stepFunc: step.rpcName,
          video: videoOffsets.get(step.stepName),
        }))
        return {
          rows: scenarioStepRows(steps, prose),
          failure: scenarioFailureFromSteps(steps, prose),
        }
      }

      const coverageActor = coverage ? Object.values(actors)[0] : undefined
      let coverageActive = Boolean(coverageActor)
      if (coverage && !coverageActor) {
        logger.warn(
          '--coverage requires at least one configured actor — skipping coverage.'
        )
      }
      const scenarioCoverage: Record<string, unknown> = {}
      const invokeCoverage = async (rpcName: string): Promise<any> => {
        if (!coverageActive || !coverageActor) return null
        try {
          return await coverageActor.invoke(rpcName, null)
        } catch (e: any) {
          coverageActive = false
          logger.warn(
            `Coverage disabled — '${rpcName}' failed against '${environment}': ${e?.message ?? e}. ` +
              `Is the server running with --coverage and "scaffold.scenarios" enabled in pikku.config.json?`
          )
          return null
        }
      }

      /**
       * A feature hook is not a pikku function and not a run — the feature is a
       * grouping, not something durable. It gets the same three arguments a
       * scenario body gets, the CLI's own singletons included, and its result is
       * discarded.
       *
       * Its context is *feature*-scoped — shared by that feature's `before` and
       * `after`, and deliberately not the context the group's scenarios see:
       * one bag across a group is the invisible coupling a Cucumber world had.
       */
      const singletonServices = pikkuState(null, 'package', 'singletonServices')
      const runFeatureHook = async (
        hook: NonNullable<ScenarioPlanGroup['before']>,
        context: Record<string, unknown>
      ) => {
        await hook(singletonServices as any, undefined, {
          actors,
          scenario: { context },
        } as any)
      }

      const hookFailures: string[] = []

      /**
       * Which registration ran and which feature grouped it, snapshotted into
       * the record because a run read back next week is describing a suite
       * whose source has moved on.
       */
      const identityOf = (
        scenarioName: string,
        group?: ScenarioPlanGroup
      ): ScenarioRunIdentity => {
        const meta = state.workflows?.meta?.[scenarioName] as
          | {
              tags?: string[]
              title?: string
              description?: string
              actors?: string[]
            }
          | undefined
        return {
          scenarioName,
          featureId: group?.featureId,
          featureName: group?.featureName,
          title: meta?.title,
          description: meta?.description,
          actors: meta?.actors,
          tags: meta?.tags,
        }
      }

      const runEntry = async (
        label: string,
        scenarioName: string,
        data: unknown,
        identity: ScenarioRunIdentity
      ) => {
        const startedAt = Date.now()
        await runStore.recordScenario(
          captureRunId,
          identifyScenarioResult(
            { name: label, status: 'running', durationMs: 0 },
            identity
          )
        )
        if (databaseBaseline) {
          try {
            await databaseBaseline.restore()
          } catch (e: any) {
            const result = identifyScenarioResult(
              {
                name: label,
                status: 'failed',
                durationMs: Date.now() - startedAt,
                error: `database reset failed: ${e?.message ?? e}`,
              },
              identity
            )
            results.push(result)
            await runStore.recordScenario(captureRunId, result)
            return
          }
        }
        // Before the scenario, not after it: the last scenario's window is left
        // open for headed debugging, while this one still starts clean.
        await browserLifecycle.reset()
        // After the reset, which is what closes the previous scenario's context
        // and finalises its video.
        browserLifecycle.beginScenario(label)
        if (coverageActive) {
          const reset = await invokeCoverage('pikkuScenarioResetLiveCoverage')
          if (reset && reset.enabled === false) {
            coverageActive = false
            logger.warn(
              `Coverage disabled — '${environment}' is not collecting (start the server with --coverage).`
            )
          }
        }
        try {
          await coverageActor?.invoke('pikkuScenarioResetStubs', null)
        } catch {}
        let runId: string | undefined
        let runError: { stack?: string; expected?: boolean } | undefined
        try {
          // The id comes back through the callback rather than the return value
          // because a failing scenario throws instead of returning — and a failed
          // run is exactly the one whose steps are worth reading.
          ;({ runId } = await workflowService.startWorkflow(
            scenarioName,
            data,
            { type: 'cli' },
            guardRpc,
            { actors, onRunCreated: (id) => (runId = id) }
          ))
          const run = await workflowService.getRun(runId)
          if (run?.status === 'completed') {
            results.push({
              name: label,
              status: 'passed',
              durationMs: Date.now() - startedAt,
              output: run.output,
            })
          } else {
            runError = run?.error
            results.push({
              name: label,
              status: 'failed',
              durationMs: Date.now() - startedAt,
              error: run?.error?.message ?? `status: ${run?.status}`,
            })
          }
        } catch (e: any) {
          runError = { stack: e?.stack }
          results.push({
            name: label,
            status: 'failed',
            durationMs: Date.now() - startedAt,
            error: e?.message ?? String(e),
          })
        }
        const result = results[results.length - 1]!
        let stepFailure: ScenarioFailureDetail | undefined
        if (runId) {
          const read = await readRunSteps(workflowService, runId, scenarioName)
          result.steps = read.rows
          stepFailure = read.failure
        }
        if (result.status === 'failed') {
          result.failure = {
            // A scenario can also fail outside any step — a hook, or the start
            // itself — and then the run's own error is all there is to report.
            ...(stepFailure ?? {
              message: result.error ?? 'unknown failure',
              stack: runError?.stack,
              expected: runError?.expected,
            }),
            browser: await browserLifecycle.captureFailure(label),
          }
        }
        // Told here, acted on at the next scenario's reset — that is what closes
        // these windows and finalises the video this outcome decides the fate of.
        browserLifecycle.endScenario(result.status)
        Object.assign(result, identifyScenarioResult(result, identity))
        await runStore.recordScenario(captureRunId, result)
        if (coverageActive) {
          const report = await invokeCoverage('pikkuScenarioTakeLiveCoverage')
          if (report) {
            scenarioCoverage[label] = report
            const covered = report.functions?.filter(
              (f: any) => f.status === 'covered' || f.status === 'partial'
            )
            logger.info(
              `  coverage: ${covered?.length ?? 0}/${report.summary?.total ?? 0} functions exercised by '${label}'`
            )
          }
        }
      }

      for (const group of groups) {
        const groupName = group.featureName ?? group.featureId
        const label = (entry: (typeof group.entries)[number]) => {
          const data = entry.data ? ` ${JSON.stringify(entry.data)}` : ''
          return groupName
            ? `${groupName} › ${entry.scenarioName}${data}`
            : entry.scenarioName
        }

        const featureContext: Record<string, unknown> = {}

        let beforeError: any
        let beforeStage = 'before hook'
        if (databaseBaseline && group.before) {
          // The hook builds on the seed, never on the last feature's leftovers,
          // and what it builds is then captured as the state each of this
          // feature's scenarios is rolled back to.
          try {
            await databaseBaseline.restore()
          } catch (e: any) {
            beforeStage = 'database reset'
            beforeError = e
          }
        }
        if (!beforeError && group.before) {
          try {
            await runFeatureHook(group.before, featureContext)
            await databaseBaseline?.pushFeatureLayer()
          } catch (e: any) {
            beforeError = e
          }
        }

        try {
          if (beforeError) {
            // Setup failed, so nothing in the group ran. Reporting them as failed
            // rather than skipped is the honest reading: they did not pass.
            for (const entry of group.entries) {
              const result = identifyScenarioResult(
                {
                  name: label(entry),
                  status: 'failed',
                  durationMs: 0,
                  error: `${groupName ? `feature '${groupName}' ` : ''}${beforeStage} failed: ${beforeError?.message ?? beforeError}`,
                },
                identityOf(entry.scenarioName, group)
              )
              results.push(result)
              await runStore.recordScenario(captureRunId, result)
            }
          } else {
            for (const entry of group.entries) {
              await runEntry(
                label(entry),
                entry.scenarioName,
                entry.data,
                identityOf(entry.scenarioName, group)
              )
            }
          }
        } finally {
          if (group.after) {
            try {
              await runFeatureHook(group.after, featureContext)
            } catch (e: any) {
              hookFailures.push(
                `feature '${groupName}' after hook failed: ${e?.message ?? e}`
              )
            }
          }
          await databaseBaseline?.popFeatureLayer()
        }
      }

      await browserLifecycle.close()

      // Collected after the browser has closed, because a video is only finalised
      // when its context is — and renamed again by the encode that close() runs.
      // This is the first moment the answer is complete.
      const artifacts = browserLifecycle.artifacts()
      await runStore.attachArtifacts(captureRunId, artifacts)

      const failed = results.filter((r) => r.status === 'failed')
      await runStore.finish(captureRunId, {
        status:
          failed.length > 0 || hookFailures.length > 0 ? 'failed' : 'passed',
        finishedAt: new Date().toISOString(),
        skipped,
        hookFailures,
      })

      // A capture nobody can find is a capture nobody looks at, and looking at
      // them is the entire point of the flags. Announced only when the run
      // actually filed something: every run leaves a record behind, and most of
      // them have no images or footage to go with it.
      if (artifacts.length > 0) {
        logger.info(`Captures → ${join(capture.dir, capture.runId)}`)
      }

      if (coverage && Object.keys(scenarioCoverage).length > 0) {
        const coverageDir = join(
          resolve(config.rootDir, config.outDir),
          'coverage'
        )
        mkdirSync(coverageDir, { recursive: true })
        const outFile = join(coverageDir, 'scenario-coverage.json')
        writeFileSync(
          outFile,
          JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              environment,
              scenarios: scenarioCoverage,
            },
            null,
            2
          ) + '\n'
        )
        logger.info(`Scenario coverage → ${outFile}`)
      }

      const report = { environment, results, skipped, hookFailures }
      for (const { level, text } of formatScenarioReport(report, {
        trace,
        projectRoot: config.rootDir,
      })) {
        const write: (message: string) => void = logger[level].bind(logger)
        write(text)
      }

      // How much of the run actually happened on the surface it targeted. Every
      // step counts, so a step that fell back to the server lowers the ratio
      // rather than needing a footnote. Assertions that fell back are named
      // separately — those are sentences claiming an observation nobody made.
      const surfaceCoverage = { onSurface: 0, total: 0 }
      const unwitnessed = new Set<string>()
      for (const name of scenarioNames) {
        const scenario = scenarioSurfaceCoverage(
          state.workflows?.meta?.[name],
          functionsMeta,
          runSurface
        )
        surfaceCoverage.onSurface += scenario.onSurface
        surfaceCoverage.total += scenario.total
        for (const step of scenario.unwitnessed) unwitnessed.add(step)
      }
      if (runSurface !== 'default' && surfaceCoverage.total > 0) {
        const line = `${surfaceCoverage.onSurface}/${surfaceCoverage.total} steps ran on ${runSurface}`
        if (unwitnessed.size === 0) {
          logger.info(line)
        } else {
          const write: (message: string) => void =
            logger[strict ? 'error' : 'warn'].bind(logger)
          write(
            `${line} — asserted server-side only: ${[...unwitnessed].join(', ')}`
          )
        }
      }

      // Exiting 0 here makes "62 held back" and "62 passed" indistinguishable
      // to CI, which is how a whole browser suite went unrun.
      if (unrunnable.length > 0) {
        logger.error(
          `${unrunnable.length} scenario(s) could not run on '${runSurface}' — no binding for that surface and no default to fall back to. ` +
            `Run them on the surface they are written for (--run browser), or hold them back explicitly with --exclude-tags.`
        )
      }

      if (
        failed.length > 0 ||
        hookFailures.length > 0 ||
        unrunnable.length > 0 ||
        (strict && unwitnessed.size > 0)
      ) {
        process.exitCode = 1
      }
    } finally {
      if (databaseBaseline) {
        // The copies are tables like any other, so a database left holding them
        // reads as schema drift the next time anything introspects it.
        try {
          await databaseBaseline.drop()
        } catch (e: any) {
          logger.warn(
            `scenario reset: could not drop the baseline copies: ${e?.message ?? e}`
          )
        }
      }
    }
  },
})

/**
 * `pikku scenario guide` — the suite, written out as markdown.
 *
 * Structure comes from the registry (which features exist, what their scenarios
 * are called), and evidence from the latest run record (what the steps actually
 * said, and what they filed). Editorial prose comes from the project's own
 * `docs/` sources, which cite a feature by leaving the marker pair where its
 * block belongs; this merges the three and writes one markdown file per source.
 * It renders nothing, resolves no asset URLs and calls no model: the writing is
 * somebody else's concern, and this is the compiler that keeps it honest.
 */
export const scenarioGuide = pikkuSessionlessFunc<
  {
    docs?: string
    output?: string
    runId?: string
    allowUndocumented?: boolean
    artifactBase?: string
  },
  void
>({
  func: async (
    { logger, config, getInspectorState },
    { docs = 'docs', output, runId, allowUndocumented = false, artifactBase }
  ) => {
    const state = await getInspectorState(false, false, false, true)
    const outDir = resolve(config.rootDir, config.outDir)
    await loadScenarioBootstrap(outDir)
    const { features: registeredFeatures } = collectRegisteredWirings()

    const runsDir = join(outDir, 'scenario-runs')
    const runStore = new FileScenarioRunStore({ dir: runsDir })
    const latest = runId ?? (await runStore.list({ limit: 1 }))[0]?.runId
    const record = latest ? await runStore.get(latest) : undefined
    if (!record) {
      logger.error(
        runId
          ? `No run '${runId}' under ${runsDir}.`
          : `No scenario run under ${runsDir} — run \`pikku scenario run <environment> --screenshots\` first, since a guide is written out of what a run recorded.`
      )
      process.exitCode = 1
      return
    }

    if (record.status !== 'passed') {
      logger.error(
        `Run '${record.runId}' is ${record.status}. A guide is a claim that the product does what the page says, so it is only ever written out of a run that passed.`
      )
      process.exitCode = 1
      return
    }
    if (record.selection) {
      const narrowed = Object.entries(record.selection)
        .map(([flag, values]) => `--${flag} ${(values as string[]).join(',')}`)
        .join(' ')
      logger.error(
        `Run '${record.runId}' was narrowed (${narrowed}), so it is missing scenarios the suite has. Guide pages would be written as though those flows do not exist — run the whole suite, or pass --run-id for one that was.`
      )
      process.exitCode = 1
      return
    }

    const workflowsMeta = state.workflows?.meta ?? {}
    const features: GuideFeature[] = [...registeredFeatures].map(
      ([id, feature]) => {
        const name = feature.name ?? id
        return {
          id,
          name,
          ...(feature.description ? { description: feature.description } : {}),
          document: feature.document !== false,
          scenarios: record.results
            // By id, never by the display name: a title is rewritten freely,
            // and two features are allowed to share one.
            .filter(
              (result) =>
                result.featureId === id ||
                (result.featureId === undefined && result.feature === name)
            )
            .map((result) => {
              const meta = result.scenarioName
                ? workflowsMeta[result.scenarioName]
                : undefined
              return {
                name: result.scenarioName ?? result.name,
                title: meta?.title ?? result.name,
                ...(meta?.description ? { description: meta.description } : {}),
                steps: (result.steps ?? []).map((step) =>
                  guideStep(step.sentence)
                ),
                screenshots: (result.artifacts ?? [])
                  .filter((artifact) => artifact.kind === 'screenshot')
                  .map((artifact) => ({
                    ...(artifact.id ? { id: artifact.id } : {}),
                    ...(artifact.name ? { name: artifact.name } : {}),
                    path: artifact.path,
                  })),
                videos: (result.artifacts ?? [])
                  .filter((artifact) => artifact.kind === 'video')
                  .map((artifact) => ({
                    ...(artifact.id ? { id: artifact.id } : {}),
                    ...(artifact.actor ? { actor: artifact.actor } : {}),
                    path: artifact.path,
                  })),
              }
            }),
        }
      }
    )

    const docsDir = resolve(config.rootDir, docs)
    const sources = (
      await glob('**/*.md', { cwd: docsDir, onlyFiles: true })
    ).sort()
    const pages: GuidePage[] = []
    for (const source of sources) {
      pages.push(
        parseGuidePage(source, readFileSync(join(docsDir, source), 'utf-8'))
      )
    }

    const lockPath = join(docsDir, '.guide.lock')
    const lock: GuideLock = existsSync(lockPath)
      ? parseGuideLock(readFileSync(lockPath, 'utf-8'))
      : {}

    const coverage = checkGuideCoverage(features, pages, lock)
    for (const { path, featureId } of coverage.unknown) {
      logger.error(
        `${join(docs, path)} cites '${featureId}', which is not a registered feature — a page describing something that no longer exists.`
      )
    }
    for (const { path, featureId } of coverage.optedOut) {
      logger.error(
        `${join(docs, path)} cites '${featureId}', which declares \`document: false\`.`
      )
    }
    for (const { path, featureId } of coverage.figureless) {
      logger.warn(
        `${join(docs, path)} cites '${featureId}', whose run filed no screenshot — the block renders empty. Take one with \`actor.screenshot(...)\` in a scenario the feature owns.`
      )
    }
    for (const { path, featureId, locked, current } of coverage.stale) {
      logger.warn(
        `${join(docs, path)} was written against '${featureId}' at ${locked}, which is now ${current} — the flow moved, so re-read the prose around that block.`
      )
    }
    for (const featureId of coverage.missing) {
      const message = `Feature '${featureId}' is cited by no page. Place \`<!-- pikku:guide feature=${featureId} -->\` and \`<!-- /pikku:guide -->\` in a page under ${docs}/, or set \`document: false\` on the feature.`
      if (allowUndocumented) {
        logger.warn(message)
      } else {
        logger.error(message)
      }
    }

    // A compiler that has found an error does not emit. Undocumented features
    // are the one failure that can be downgraded, because a suite mid-way
    // through being written still wants its pages built.
    if (
      coverage.unknown.length > 0 ||
      coverage.optedOut.length > 0 ||
      (!allowUndocumented && coverage.missing.length > 0)
    ) {
      process.exitCode = 1
      return
    }

    const byId = new Map(features.map((feature) => [feature.id, feature]))
    const outputDir = output
      ? resolve(config.rootDir, output)
      : join(outDir, 'guide')
    const artifactRoot = join(runsDir, record.runId)
    for (const page of pages) {
      const target = join(outputDir, page.path)
      // Relative, forward-slashed and computed per page: a guide is markdown
      // with ordinary image refs, and whoever consumes it rewrites the paths.
      // `artifactBase` replaces it with one prefix for every page, for a host
      // that serves the artifacts at a fixed address rather than beside the
      // markdown — and it stays as given, since only the caller knows whether
      // it is a path, a route or an origin.
      const base = artifactBase
        ? artifactBase.endsWith('/')
          ? artifactBase
          : `${artifactBase}/`
        : `${relative(dirname(target), artifactRoot).split(sep).join('/')}/`
      const markdown = renderGuidePage(page, byId, base)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, markdown)
    }
    writeFileSync(lockPath, renderGuideLock(features, coverage.cited))
    logger.info(
      `${pages.length} page(s) → ${outputDir} (run ${record.runId}, ${coverage.cited.length} documented feature(s))`
    )
    for (const feature of features) {
      if (feature.document) {
        logger.debug(`  ${feature.id} ${featureEvidence(feature)}`)
      }
    }
  },
})
