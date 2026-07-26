import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku'
import {
  InMemoryWorkflowService,
  createHttpScenarioActors,
} from '@pikku/core/services'
import { pikkuState, getAllPackageStates } from '@pikku/core/internal'
import { resolveFeatureScenarios } from '@pikku/core/workflow'
import type { CoreFeature, CoreWorkflow } from '@pikku/core/workflow'

import { loadUserBootstrap } from './load-user-project.js'
import {
  buildStepLadder,
  collectScenarioStepProse,
  scenarioBrowserSteps,
} from './scenario-ladder.js'
import { buildScenarioPlan } from './scenario-plan.js'
import type { ScenarioPlanGroup } from './scenario-plan.js'

const isScenario = (wf: any) => wf?.scenario === true

const listScenarios = (state: any) =>
  Object.entries(state.workflows?.meta ?? {})
    .filter(([, wf]) => isScenario(wf))
    .map(([id, wf]: [string, any]) => ({
      id,
      name: wf.name ?? id,
      description: wf.description ?? wf.summary ?? wf.title ?? null,
      tags: wf.tags ?? [],
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
    const state = await getInspectorState()
    const flows = listScenarios(state)
    if (flows.length === 0) {
      logger.info('No scenarios found (pikkuScenario exports).')
      return
    }

    await loadUserBootstrap(resolve(config.rootDir, config.outDir))
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
    coverage?: boolean
    browser?: boolean
  },
  void
>({
  func: async (
    { logger, config, getInspectorState, variables },
    { environment, flows, features, tags, coverage, browser = true }
  ) => {
    const state = await getInspectorState(true)

    const environments = config.scenarios?.environments ?? {}
    const env = environments[environment]
    if (!env) {
      const known = Object.keys(environments)
      throw new Error(
        `Unknown scenario environment '${environment}'. ` +
          (known.length
            ? `Configured environments: ${known.join(', ')}`
            : `Add scenarios.environments to pikku.config.json, e.g. { "${environment}": { "apiUrl": "https://app.example.com/api" } }`)
      )
    }

    // Features live in runtime state, not inspector meta — their scenario lists
    // may be built by an ordinary loop — so the project has to be loaded before
    // anything can be selected.
    await loadUserBootstrap(resolve(config.rootDir, config.outDir))
    const { features: registeredFeatures, registrations } =
      collectRegisteredWirings()

    const split = (value?: string) =>
      value ? value.split(',').map((part) => part.trim()) : undefined

    let { groups, unresolved } = buildScenarioPlan({
      scenarios: listScenarios(state).map(({ name, tags: flowTags }) => ({
        name,
        tags: flowTags,
      })),
      features: registeredFeatures,
      registrations,
      flows: split(flows),
      featureIds: split(features),
      tags: split(tags),
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
    const actors = createHttpScenarioActors({
      apiUrl: env.apiUrl,
      secret,
      actors: config.scenarios?.actors ?? {},
      signInPath: env.signInPath,
      rpcPath: env.rpcPath,
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

    // `--no-browser` is the direct replacement for cucumber's `@console` tag:
    // browser scenarios are SKIPPED, not failed, so a standard run stays green
    // on a machine with no browser.
    const skipped = browser ? [] : [...browserStepsByFlow.keys()]
    if (skipped.length > 0) {
      groups = groups
        .map((group) => ({
          ...group,
          entries: group.entries.filter(
            (entry) => !browserStepsByFlow.has(entry.scenarioName)
          ),
        }))
        .filter((group) => group.entries.length > 0)
      for (const name of skipped) {
        logger.info(`SKIP ${name} (browser steps, --no-browser)`)
      }
    }

    const workflowService = new InMemoryWorkflowService()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      workflowService,
      workflowRunService: workflowService,
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

    const needsBrowser = groups.some((group) =>
      group.entries.some((entry) => browserStepsByFlow.has(entry.scenarioName))
    )
    let browserProvider: { close(): Promise<void> } | undefined
    if (needsBrowser) {
      // Fail fast, before a single scenario runs: a missing driver or appUrl
      // discovered mid-flow costs a whole run to find out.
      if (!env.appUrl) {
        throw new Error(
          `Scenario environment '${environment}' has browser steps but no 'appUrl'. ` +
            `Add it to scenarios.environments.${environment} in pikku.config.json, or run with --no-browser to skip them.`
        )
      }
      const { PlaywrightScenarioBrowserProvider, browserConfigFromEnv } =
        await import('@pikku/playwright').catch(() => {
          throw new Error(
            `Scenarios ${[...browserStepsByFlow.keys()].join(', ')} declare browser steps but @pikku/playwright is not installed. ` +
              `Run 'yarn add -D @pikku/playwright @playwright/test', or run with --no-browser to skip them.`
          )
        })
      const provider = new PlaywrightScenarioBrowserProvider({
        secret,
        actors: config.scenarios?.actors ?? {},
        signInPath: env.signInPath,
        config: browserConfigFromEnv({
          appUrl: env.appUrl,
          apiUrl: env.apiUrl,
        }),
      })
      workflowService.setScenarioBrowserProvider(provider)
      browserProvider = provider
    }

    const results: Array<{
      name: string
      status: 'passed' | 'failed'
      durationMs: number
      output?: unknown
      error?: string
      ladder?: string[]
    }> = []

    /**
     * The step ladder is read back off the recorded run, so it needs no live
     * step events — it is the same data the console renders.
     */
    const renderLadder = async (
      service: InMemoryWorkflowService,
      runId: string,
      flowName: string
    ): Promise<string[]> => {
      const prose = collectScenarioStepProse(
        state.workflows?.meta?.[flowName],
        functionsMeta
      )
      const steps = await service.getRunSteps(runId)
      return buildStepLadder(
        steps.map((step) => ({
          stepName: step.stepName,
          status: step.status,
          durationMs: step.succeededAt
            ? step.succeededAt.getTime() - step.createdAt.getTime()
            : undefined,
          error: step.error?.message,
          input: step.data,
          stepFunc: step.rpcName,
        })),
        prose
      )
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
      try {
        ;({ runId } = await workflowService.startWorkflow(
          scenarioName,
          data,
          { type: 'cli' },
          guardRpc,
          { actors }
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
          results.push({
            name: label,
            status: 'failed',
            durationMs: Date.now() - startedAt,
            error: run?.error?.message ?? `status: ${run?.status}`,
          })
        }
      } catch (e: any) {
        results.push({
          name: label,
          status: 'failed',
          durationMs: Date.now() - startedAt,
          error: e?.message ?? String(e),
        })
      }
      if (runId) {
        results[results.length - 1]!.ladder = await renderLadder(
          workflowService,
          runId,
          scenarioName
        )
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

    await browserProvider?.close()

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

    const failed = results.filter((r) => r.status === 'failed')
    for (const r of results) {
      if (r.status === 'passed') {
        logger.info(
          `PASS ${r.name} (${r.durationMs}ms)${r.output !== undefined ? ` → ${JSON.stringify(r.output)}` : ''}`
        )
      } else {
        logger.error(`FAIL ${r.name} (${r.durationMs}ms): ${r.error}`)
      }
      for (const line of r.ladder ?? []) {
        logger.info(line)
      }
    }
    for (const hookFailure of hookFailures) {
      logger.error(hookFailure)
    }
    const skippedSuffix = skipped.length
      ? `, ${skipped.length} skipped (--no-browser)`
      : ''
    const hookSuffix = hookFailures.length
      ? `, ${hookFailures.length} feature hook failure(s)`
      : ''
    logger.info(
      `${results.length - failed.length}/${results.length} scenarios passed against '${environment}'${skippedSuffix}${hookSuffix}`
    )
    if (failed.length > 0 || hookFailures.length > 0) {
      process.exitCode = 1
    }
  },
})
