import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { pikkuSessionlessFunc } from '#pikku/function'
import { generatePlan } from '../../deploy/plan/index.js'
import { formatPlan } from '../../deploy/plan/formatter.js'
import {
  describeBuildFailure,
  PikkuDeployBuildFailedError,
} from '../../deploy/build-pipeline.js'
import type { ProviderAdapter } from '@pikku/deploy'
import type { DeployProvider } from '../../deploy/plan/provider.js'
import { resolveProvider, getEntryContext } from './deploy-apply.js'
import {
  assertFrontendSupported,
  backendState,
  buildBackend,
  NOTHING_TO_DEPLOY,
  planBackendDeploys,
  planFrontendDeploys,
  resultFileFor,
} from './deploy-backends.js'

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

export const deployPlan = pikkuSessionlessFunc<
  {
    resultFile?: string
    provider?: string
    backend?: string
    debugArtifacts?: boolean
  },
  void
>({
  func: async ({ logger, config, getInspectorState, bundler }, data) => {
    const projectDir = config.rootDir
    const backends = planBackendDeploys(config, {
      backend: data?.backend,
      provider: data?.provider,
    })
    if (
      backends.length === 0 &&
      planFrontendDeploys(config, { provider: data?.provider }, backends)
        .length === 0
    ) {
      logger.info(NOTHING_TO_DEPLOY)
      return
    }
    // Every provider is resolved, and every frontend checked against its
    // provider, before the first backend builds.
    const providers = new Map<string, ProviderAdapter>()
    for (const backend of backends) {
      providers.set(
        backend.name,
        await resolveProvider(config, backend.providerName, { projectDir })
      )
    }
    for (const frontend of planFrontendDeploys(
      config,
      { provider: data?.provider },
      backends
    )) {
      const provider =
        [...providers.values()].find((p) => p.name === frontend.providerName) ??
        (await resolveProvider(config, frontend.providerName, { projectDir }))
      assertFrontendSupported(frontend, provider)
    }
    const unfilteredState = await getInspectorState(true)
    const projectId = await resolveProjectId(projectDir)
    const failures: string[] = []

    for (const backend of backends) {
      if (backend.many) logger.info(`Backend ${backend.name}`)
      const provider = providers.get(backend.name)!

      const result = await buildBackend({
        config,
        backend,
        provider,
        projectId,
        inspectorState: backendState(config, unfilteredState, backend, logger),
        getEntryContext,
        debugArtifacts: data?.debugArtifacts ?? false,
        logger,
        bundler,
      })

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

      // Write result file if --result-file is set (used by Pikku Studio Cloud build pipeline)
      const resultFile = resultFileFor(data?.resultFile, backend)
      if (resultFile) {
        const { writeFile } = await import('node:fs/promises')
        await writeFile(
          resultFile,
          JSON.stringify(
            {
              success: result.bundleErrors.length === 0,
              backend: backend.name,
              provider: provider.name,
              providerDir: result.providerDir,
              unitCount: result.bundled.length,
              totalSizeBytes: totalSize,
              errors: result.bundleErrors,
              codegenErrors: result.codegenErrors,
              summary: plan.summary,
              changeCount: plan.changes.length,
              artifacts: {
                deploymentManifestPath: result.deploymentManifestPath,
                infraPath: result.infraPath,
              },
            },
            null,
            2
          ),
          'utf-8'
        )
      }

      const buildFailure = describeBuildFailure(result)
      if (buildFailure) {
        failures.push(
          backend.many ? `${backend.name}: ${buildFailure}` : buildFailure
        )
      }
    }

    if (failures.length > 0) {
      throw new PikkuDeployBuildFailedError(failures.join('\n'))
    }
  },
})
