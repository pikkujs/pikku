import { pikkuVoidFunc } from '#pikku'
import { analyzeProject } from '../../deploy/analyzer/index.js'
import { bundleWorkers } from '../../deploy/bundler/index.js'
import { generatePlan } from '../../deploy/plan/index.js'
import { applyPlan } from '../../deploy/plan/executor.js'
import { formatPlan } from '../../deploy/plan/formatter.js'
import type { DeployProvider } from '../../deploy/plan/provider.js'
import type { PlanChange } from '../../deploy/plan/types.js'

const ANSI = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

function createEmptyProvider(): DeployProvider {
  return {
    async getCurrentState() {
      // TODO: Load provider from config and get real state
      return {
        workers: [],
        queues: [],
        d1Databases: [],
        r2Buckets: [],
        cronTriggers: [],
        containers: [],
        secrets: [],
        variables: {},
      }
    },
    async applyChange(_change, _manifest) {
      // TODO: Delegate to @pikku/deploy-cloudflare (or other provider)
      // For now, this is a stub
      await new Promise((r) => setTimeout(r, 100))
    },
    async hasActiveWork() {
      return { active: false, pendingCount: 0 }
    },
  }
}

function logProgress(
  change: PlanChange,
  status: 'start' | 'done' | 'error',
  error?: string
) {
  const action = change.action
  const color =
    action === 'create'
      ? ANSI.green
      : action === 'update'
        ? ANSI.blue
        : action === 'delete'
          ? ANSI.red
          : ANSI.yellow

  if (status === 'start') {
    process.stdout.write(
      `  ${color}${action}${ANSI.reset} ${change.resourceType} ${ANSI.bold}${change.name}${ANSI.reset}...`
    )
  } else if (status === 'done') {
    process.stdout.write(` ${ANSI.green}done${ANSI.reset}\n`)
  } else {
    process.stdout.write(` ${ANSI.red}error: ${error}${ANSI.reset}\n`)
  }
}

export const deployApply = pikkuVoidFunc({
  func: async ({ logger, config }) => {
    const projectDir = process.cwd()

    // Step 1: Analyze
    logger.info('Analyzing project...')
    const manifest = await analyzeProject(projectDir)
    logger.info(
      `Found ${manifest.workers.length} workers, ${manifest.queues.length} queues, ${manifest.cronTriggers.length} cron triggers`
    )

    // Step 2: Generate entry points + Bundle
    // TODO: Load provider-specific entry generator based on --provider flag
    // For now, stub entry files (real implementation comes from @pikku/deploy-cloudflare)
    logger.info('Bundling workers...')
    const entryFiles = new Map<string, string>()
    for (const w of manifest.workers) {
      entryFiles.set(w.name, w.entryPoint)
    }
    const { results: bundled, errors: bundleErrors } = await bundleWorkers(
      projectDir,
      manifest,
      entryFiles
    )
    logger.info(
      `Bundled ${bundled.length} workers${bundleErrors.length > 0 ? ` (${bundleErrors.length} failed)` : ''}`
    )

    if (bundleErrors.length > 0) {
      for (const f of bundleErrors) {
        logger.error(`  Failed: ${f.workerName} — ${f.error}`)
      }
    }

    // Step 3: Plan
    logger.info('Planning deployment...')
    const provider = createEmptyProvider()
    const currentState = await provider.getCurrentState(manifest.projectId)
    const plan = await generatePlan(manifest, currentState, provider)

    console.log('')
    console.log(formatPlan(plan))
    console.log('')

    if (plan.changes.length === 0) {
      logger.info('Nothing to deploy.')
      return
    }

    // Step 4: Apply
    logger.info('Applying...')
    const result = await applyPlan(plan, manifest, provider, {
      onProgress: logProgress,
    })

    console.log('')
    if (result.success) {
      logger.info(`${ANSI.green}${ANSI.bold}Deployment complete.${ANSI.reset}`)
    } else {
      const errors = result.applied.filter((r) => r.status === 'error')
      logger.error(`Deployment finished with ${errors.length} error(s).`)
    }
  },
})
