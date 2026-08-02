import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku'
import {
  InMemoryWorkflowService,
  createHttpScenarioActors,
} from '@pikku/core/services'
import { PikkuScenarioService } from '@pikku/core/scenario'
import { pikkuState, getAllPackageStates } from '@pikku/core/internal'
import { resolveFeatureScenarios } from '@pikku/core/workflow'
import type { CoreFeature, CoreWorkflow } from '@pikku/core/workflow'

import { loadScenarioBootstrap } from './load-user-project.js'
import {
  collectScenarioStepProse,
  scenarioBrowserSteps,
  scenarioFailureFromSteps,
  scenarioStepRows,
  scenarioStepsWithoutBinding,
  scenarioSurfaceCoverage,
} from './scenario-ladder.js'
import { SCENARIO_SURFACES } from '@pikku/core/workflow'
import type { ScenarioSurface } from '@pikku/core/workflow'
import { formatScenarioReport } from './scenario-formatter.js'
import type {
  ScenarioFailureDetail,
  ScenarioStepRow,
} from './scenario-formatter.js'
import {
  resolveScenarioBrowserProvider,
  scenarioBrowserLifecycle,
} from './scenario-browser.js'
import { resolveScenarioActors } from '../../utils/resolve-scenario-actors.js'
import { spawnDevServer } from '../../server/spawn-dev-server.js'
import { buildScenarioPlan } from './scenario-plan.js'
import type { ScenarioPlanGroup } from './scenario-plan.js'
import { resolveScenarioEnvironment } from './scenario-environment.js'
import { createDevAIAgentRunner } from './dev-ai-runner.js'

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
    browser?: boolean
    run?: ScenarioSurface
    strict?: boolean
    spawn?: boolean
    keepAlive?: boolean
    trace?: boolean
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
      browser = true,
      run: runSurface = 'default',
      strict = false,
      spawn = false,
      keepAlive = false,
      trace = false,
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
    const env = resolveScenarioEnvironment({
      environment,
      environments: config.scenarios?.environments ?? {},
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

    const secret = await variables.get('SCENARIO_ACTOR_SECRET')
    if (!secret) {
      throw new Error(
        'SCENARIO_ACTOR_SECRET is not set — scenario actors cannot sign in. ' +
          'Export it in the environment running this command (never put it in pikku.config.json).'
      )
    }
    // Declared actors plus one per persona nobody declared a body for. Resolved
    // once: the HTTP actors and the Playwright provider below must see the same
    // registry, and codegen resolved the same way to type `ScenarioActorName`.
    const scenarioActors = resolveScenarioActors(config.scenarios)
    const actors = createHttpScenarioActors({
      apiUrl: env.apiUrl,
      secret,
      actors: scenarioActors,
      signInPath: env.signInPath,
      rpcPath: env.rpcPath,
      model: config.scenarios?.actorModel,
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
    // `--no-browser` is the blunt form of `--run default`: a machine with no
    // browser takes the server-side path rather than skipping the scenario.
    const effectiveSurface: ScenarioSurface =
      browser === false && runSurface === 'browser' ? 'default' : runSurface
    const unrunnableStepsByFlow = new Map<string, string[]>(
      [...scenarioNames]
        .map(
          (name) =>
            [
              name,
              scenarioStepsWithoutBinding(
                state.workflows?.meta?.[name],
                functionsMeta,
                effectiveSurface
              ),
            ] as const
        )
        .filter(([, steps]) => steps.length > 0)
    )

    // Two reasons a scenario is held back, both reported as SKIP rather than
    // failed. `--no-browser` is the direct replacement for cucumber's `@console`
    // tag, so a standard run stays green on a machine with no browser; a `skip`
    // on the scenario itself is the project quarantining it, and the plan has
    // already cleared that reason for anything named directly with `--flows`.
    const skipReasonFor = (entry: {
      scenarioName: string
      skip?: string
    }): string | undefined => {
      if (entry.skip) return entry.skip
      const unrunnable = unrunnableStepsByFlow.get(entry.scenarioName)
      if (unrunnable?.length) {
        return `no ${effectiveSurface} or default binding: ${unrunnable.join(', ')}`
      }
      return undefined
    }

    const skipped: Array<{ name: string; reason: string }> = []
    groups = groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          const reason = skipReasonFor(entry)
          if (!reason) return true
          skipped.push({ name: entry.scenarioName, reason })
          return false
        }),
      }))
      .filter((group) => group.entries.length > 0)

    const workflowService = new InMemoryWorkflowService()
    const scenarioService = workflowService.setRunExtension(
      (engine) => new PikkuScenarioService(engine)
    )
    scenarioService.setScenarioEnvironment({
      apiUrl: env.apiUrl,
      appUrl: env.appUrl,
    })
    scenarioService.setRunSurface(effectiveSurface)

    // Scenario steps run here, not on the target — everything they touch of the
    // app goes over HTTP through an actor, which is what `guardRpc` below
    // enforces. `actor.converse` is the exception, and the reason this is not
    // just the three services above: the persona's own turns are LLM calls made
    // in this process, and without a runner every conversing scenario fails
    // before it says anything. Built the same way `pikku dev` builds its own,
    // and only when the project declares agents, so a project with no agents
    // does not have to have AI env set to run scenarios.
    const aiAgentRunner =
      Object.keys(state.agents?.agentsMeta ?? {}).length > 0
        ? await createDevAIAgentRunner({
            logger,
            projectRoot: config.rootDir,
            variables,
          })
        : undefined
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      workflowService,
      workflowRunService: workflowService,
      ...(aiAgentRunner ? { aiAgentRunner } : {}),
    } as any)
    const guardRpc = {
      rpcWithWire: async (rpcName: string) => {
        throw new Error(
          `Scenario tried to run '${rpcName}' as an internal step. Every workflow.do ` +
            `in a scenario must carry { actor: actors.x } so it executes against ` +
            `'${environment}' (${env.apiUrl}), not local services.`
        )
      },
    }

    // Only a browser run launches one. Under `--run default` a step with a
    // browser binding takes its default path instead, so there is nothing to
    // drive and nothing to pay for.
    const needsBrowser =
      effectiveSurface === 'browser' &&
      groups.some((group) =>
        group.entries.some((entry) =>
          browserStepsByFlow.has(entry.scenarioName)
        )
      )
    const failureDir = join(
      resolve(config.rootDir, config.outDir),
      'scenario-failures'
    )
    const browserLifecycle = scenarioBrowserLifecycle(
      needsBrowser
        ? await (async () => {
            const provider = await resolveScenarioBrowserProvider({
              environment,
              apiUrl: env.apiUrl,
              appUrl: env.appUrl,
              secret,
              actors: scenarioActors,
              signInPath: env.signInPath,
              failureDir,
              browserScenarios: [...browserStepsByFlow.keys()],
              driver: config.scenarios?.browserDriver,
            })
            scenarioService.setScenarioBrowserProvider(provider)
            return provider
          })()
        : undefined
    )

    const results: Array<{
      name: string
      status: 'passed' | 'failed'
      durationMs: number
      output?: unknown
      error?: string
      steps?: ScenarioStepRow[]
      failure?: ScenarioFailureDetail
    }> = []

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
        functionsMeta
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
     */
    const singletonServices = pikkuState(null, 'package', 'singletonServices')
    const runFeatureHook = async (
      hook: NonNullable<ScenarioPlanGroup['before']>
    ) => {
      await hook(singletonServices as any, undefined, { actors } as any)
    }

    const hookFailures: string[] = []

    const runEntry = async (
      label: string,
      scenarioName: string,
      data: unknown
    ) => {
      const startedAt = Date.now()
      // Before the scenario, not after it: the last scenario's window is left
      // open for headed debugging, while this one still starts clean.
      await browserLifecycle.reset()
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

      let beforeError: any
      if (group.before) {
        try {
          await runFeatureHook(group.before)
        } catch (e: any) {
          beforeError = e
        }
      }

      try {
        if (beforeError) {
          // Setup failed, so nothing in the group ran. Reporting them as failed
          // rather than skipped is the honest reading: they did not pass.
          for (const entry of group.entries) {
            results.push({
              name: label(entry),
              status: 'failed',
              durationMs: 0,
              error: `feature '${groupName}' before hook failed: ${beforeError?.message ?? beforeError}`,
            })
          }
        } else {
          for (const entry of group.entries) {
            await runEntry(label(entry), entry.scenarioName, entry.data)
          }
        }
      } finally {
        if (group.after) {
          try {
            await runFeatureHook(group.after)
          } catch (e: any) {
            hookFailures.push(
              `feature '${groupName}' after hook failed: ${e?.message ?? e}`
            )
          }
        }
      }
    }

    await browserLifecycle.close()

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
      logger[level](text)
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
        effectiveSurface
      )
      surfaceCoverage.onSurface += scenario.onSurface
      surfaceCoverage.total += scenario.total
      for (const step of scenario.unwitnessed) unwitnessed.add(step)
    }
    if (effectiveSurface !== 'default' && surfaceCoverage.total > 0) {
      const line = `${surfaceCoverage.onSurface}/${surfaceCoverage.total} steps ran on ${effectiveSurface}`
      if (unwitnessed.size === 0) {
        logger.info(line)
      } else {
        logger[strict ? 'error' : 'warn'](
          `${line} — asserted server-side only: ${[...unwitnessed].join(', ')}`
        )
      }
    }

    const failed = results.filter((r) => r.status === 'failed')
    if (
      failed.length > 0 ||
      hookFailures.length > 0 ||
      (strict && unwitnessed.size > 0)
    ) {
      process.exitCode = 1
    }
  },
})
