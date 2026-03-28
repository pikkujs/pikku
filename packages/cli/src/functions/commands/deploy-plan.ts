import { pikkuVoidFunc } from '#pikku'
import { analyzeProject } from '../../deploy/analyzer/index.js'
import { generatePlan } from '../../deploy/plan/index.js'
import { formatPlan } from '../../deploy/plan/formatter.js'
import type { DeployProvider } from '../../deploy/plan/provider.js'

function createEmptyProvider(): DeployProvider {
  // For plan-only mode, we need a provider that reports empty state
  // (first deploy) or connects to the actual provider to get current state
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
    async applyChange() {
      throw new Error('Plan mode — apply not available')
    },
    async hasActiveWork() {
      return { active: false, pendingCount: 0 }
    },
  }
}

export const deployPlan = pikkuVoidFunc({
  func: async ({ logger, config }) => {
    const projectDir = process.cwd()

    logger.info('Analyzing project...')
    const manifest = await analyzeProject(projectDir)

    logger.info(
      `Found ${manifest.workers.length} workers, ${manifest.queues.length} queues, ${manifest.cronTriggers.length} cron triggers`
    )

    const provider = createEmptyProvider()
    const currentState = await provider.getCurrentState(manifest.projectId)
    const plan = await generatePlan(manifest, currentState, provider)

    console.log('')
    console.log(formatPlan(plan))
    console.log('')
  },
})
