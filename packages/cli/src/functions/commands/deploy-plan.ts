import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { pikkuVoidFunc } from '#pikku'
import { generatePlan } from '../../deploy/plan/index.js'
import { formatPlan } from '../../deploy/plan/formatter.js'
import { runBuildPipeline } from '../../deploy/build-pipeline.js'
import type { DeployProvider } from '../../deploy/plan/provider.js'
import { resolveProvider, getEntryContext } from './deploy-apply.js'

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
  return {
    async getCurrentState() {
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
    const projectDir = config.rootDir
    const inspectorState = await getInspectorState(true)
    const projectId = await resolveProjectId(projectDir)
    const provider = resolveProvider()

    const result = await runBuildPipeline({
      projectDir,
      projectId,
      provider,
      inspectorState,
      getEntryContext,
      logger,
    })

    if (result.manifest.units.length === 0) {
      logger.info('No deployment units found.')
      return
    }

    // Show plan
    const deployProvider = createEmptyProvider()
    const currentState = await deployProvider.getCurrentState(
      result.manifest.projectId
    )
    const plan = await generatePlan(
      result.manifest,
      currentState,
      deployProvider
    )

    console.log('')
    console.log(formatPlan(plan))
    console.log('')

    // Summary
    let totalSize = 0
    for (const b of result.bundled) totalSize += b.bundleSizeBytes
    const formatBytes = (bytes: number) =>
      bytes < 1024
        ? `${bytes}B`
        : bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1)}KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)}MB`

    logger.info(
      `${result.bundled.length} workers bundled (${formatBytes(totalSize)} total)`
    )
    logger.info(`Output: ${result.providerDir}`)
  },
})
