import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

import { pikkuSessionlessFunc } from '#pikku'
import {
  InMemoryWorkflowService,
  createHttpScenarioActors,
} from '@pikku/core/services'
import { pikkuState } from '@pikku/core/internal'

import { loadUserBootstrap } from './load-user-project.js'

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

export const scenarioList = pikkuSessionlessFunc<{}, void>({
  func: async ({ logger, getInspectorState }) => {
    const state = await getInspectorState()
    const flows = listScenarios(state)
    if (flows.length === 0) {
      logger.info('No scenarios found (pikkuScenario exports).')
      return
    }
    for (const flow of flows) {
      const tags = flow.tags.length ? `  [${flow.tags.join(', ')}]` : ''
      logger.info(`${flow.name}${tags}`)
      if (flow.description) {
        logger.info(`  ${flow.description}`)
      }
    }
  },
})

export const scenarioRun = pikkuSessionlessFunc<
  { environment: string; flows?: string; tags?: string; coverage?: boolean },
  void
>({
  func: async (
    { logger, config, getInspectorState, variables },
    { environment, flows, tags, coverage }
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

    let selected = listScenarios(state)
    if (flows) {
      const names = new Set(flows.split(',').map((f) => f.trim()))
      const unknown = [...names].filter(
        (n) => !selected.some((f) => f.name === n)
      )
      if (unknown.length) {
        throw new Error(
          `Unknown scenario(s): ${unknown.join(', ')}. Available: ${selected.map((f) => f.name).join(', ')}`
        )
      }
      selected = selected.filter((f) => names.has(f.name))
    }
    if (tags) {
      const wanted = tags.split(',').map((t) => t.trim())
      selected = selected.filter((f) => wanted.some((t) => f.tags.includes(t)))
    }
    if (selected.length === 0) {
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

    await loadUserBootstrap(resolve(config.rootDir, config.outDir))
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

    const results: Array<{
      name: string
      status: 'passed' | 'failed'
      durationMs: number
      output?: unknown
      error?: string
    }> = []

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
            `Is the server running with --coverage and the console addon wired?`
        )
        return null
      }
    }

    for (const flow of selected) {
      const startedAt = Date.now()
      if (coverageActive) {
        const reset = await invokeCoverage('console:resetLiveCoverage')
        if (reset && reset.enabled === false) {
          coverageActive = false
          logger.warn(
            `Coverage disabled — '${environment}' is not collecting (start the server with --coverage).`
          )
        }
        // Stubs reset alongside coverage so expectService assertions are
        // attributable to this flow. Absent/disabled just means the server
        // has no test stubs — never disables coverage.
        try {
          await coverageActor?.invoke('console:resetStubs', null)
        } catch {
          // servers without test stubs simply skip the reset
        }
      }
      try {
        const { runId } = await workflowService.startWorkflow(
          flow.name,
          undefined,
          { type: 'cli' },
          guardRpc,
          { actors }
        )
        const run = await workflowService.getRun(runId)
        if (run?.status === 'completed') {
          results.push({
            name: flow.name,
            status: 'passed',
            durationMs: Date.now() - startedAt,
            output: run.output,
          })
        } else {
          results.push({
            name: flow.name,
            status: 'failed',
            durationMs: Date.now() - startedAt,
            error: run?.error?.message ?? `status: ${run?.status}`,
          })
        }
      } catch (e: any) {
        results.push({
          name: flow.name,
          status: 'failed',
          durationMs: Date.now() - startedAt,
          error: e?.message ?? String(e),
        })
      }
      if (coverageActive) {
        const report = await invokeCoverage('console:takeLiveCoverage')
        if (report) {
          scenarioCoverage[flow.name] = report
          const covered = report.functions?.filter(
            (f: any) => f.status === 'covered' || f.status === 'partial'
          )
          logger.info(
            `  coverage: ${covered?.length ?? 0}/${report.summary?.total ?? 0} functions exercised by '${flow.name}'`
          )
        }
      }
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

    const failed = results.filter((r) => r.status === 'failed')
    for (const r of results) {
      if (r.status === 'passed') {
        logger.info(
          `PASS ${r.name} (${r.durationMs}ms)${r.output !== undefined ? ` → ${JSON.stringify(r.output)}` : ''}`
        )
      } else {
        logger.error(`FAIL ${r.name} (${r.durationMs}ms): ${r.error}`)
      }
    }
    logger.info(
      `${results.length - failed.length}/${results.length} scenarios passed against '${environment}'`
    )
    if (failed.length > 0) {
      process.exitCode = 1
    }
  },
})
