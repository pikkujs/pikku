import { basename } from 'node:path'

import { pikkuVoidFunc } from '#pikku'
import { analyzeDeployment } from '../../deploy/analyzer/index.js'
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
        units: [],
        queues: [],
        scheduledTasks: [],
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
  func: async ({ logger, config, getInspectorState }) => {
    logger.info('Analyzing project...')
    const inspectorState = await getInspectorState(true)
    const projectId = basename(config.rootDir)
    const manifest = analyzeDeployment(inspectorState, { projectId })

    logger.info(
      `Found ${manifest.units.length} units, ${manifest.queues.length} queues, ${manifest.scheduledTasks.length} scheduled tasks`
    )

    const provider = createEmptyProvider()
    const currentState = await provider.getCurrentState(manifest.projectId)
    const plan = await generatePlan(manifest, currentState, provider)

    console.log('')
    console.log(formatPlan(plan))
    console.log('')
  },
})
