import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { pikkuVoidFunc } from '#pikku'
import { analyzeDeployment } from '../../deploy/analyzer/index.js'
import { generatePlan } from '../../deploy/plan/index.js'
import { formatPlan } from '../../deploy/plan/formatter.js'
import type { DeployProvider } from '../../deploy/plan/provider.js'

function sanitizeProjectId(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'pikku-project'
  )
}

async function resolveProjectId(projectDir: string): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(join(projectDir, 'package.json'), 'utf-8')
    )
    if (pkg.name) {
      const name = pkg.name.replace(/^@[^/]+\//, '')
      return sanitizeProjectId(name)
    }
  } catch {}
  return sanitizeProjectId(basename(projectDir))
}

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
    const projectId = await resolveProjectId(config.rootDir)
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
