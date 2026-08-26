import { randomUUID } from 'node:crypto'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

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
} from '@pikku/core/scenario'
import {
  resolveScenarioBrowserProvider,
  scenarioBrowserLifecycle,
} from './scenario-browser.js'
import { resolvePersonas } from '../../utils/resolve-personas.js'
import { resolvePersonaCredentials } from '../../utils/persona-credentials.js'
import { spawnDevServer } from '../../server/spawn-dev-server.js'
import { buildScenarioPlan } from './scenario-plan.js'
import type { ScenarioPlanGroup } from './scenario-plan.js'
import { resolveEnvironment } from './environment.js'
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
    scenarioService.setRunSurface(runSurface)

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

    const results: ScenarioResult[] = []

    // Opened before the first scenario and written to as each one finishes, so
    // a suite that dies on its fortieth still leaves the thirty-nine behind —
    // and the console can show a run while it is still going.
    const runStore = new FileScenarioRunStore({ dir: captureDir })
    const startedAtIso = new Date().toISOString()
    await runStore.start({
      runId: captureRunId,
      environment,
      surface: runSurface,
      status: 'running',
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
     * What a result carries beyond its own outcome: which registration ran,
     * which feature grouped it, and the tags it was selected by. Snapshotted
     * into the record because a run read back next week is describing a suite
     * whose source has moved on.
     */
    const identify = (
      result: ScenarioResult,
      scenarioName: string,
      feature?: string
    ): ScenarioResult => {
      const tags = state.workflows?.meta?.[scenarioName]?.tags as
        string[] | undefined
      return {
        ...result,
        scenarioName,
        ...(feature ? { feature } : {}),
        ...(tags?.length ? { tags } : {}),
      }
    }

    const runEntry = async (
      label: string,
      scenarioName: string,
      data: unknown,
      feature?: string
    ) => {
      const startedAt = Date.now()
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
      Object.assign(result, identify(result, scenarioName, feature))
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
      if (group.before) {
        try {
          await runFeatureHook(group.before, featureContext)
        } catch (e: any) {
          beforeError = e
        }
      }

      try {
        if (beforeError) {
          // Setup failed, so nothing in the group ran. Reporting them as failed
          // rather than skipped is the honest reading: they did not pass.
          for (const entry of group.entries) {
            const result = identify(
              {
                name: label(entry),
                status: 'failed',
                durationMs: 0,
                error: `feature '${groupName}' before hook failed: ${beforeError?.message ?? beforeError}`,
              },
              entry.scenarioName,
              groupName
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
              groupName
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
  },
})
