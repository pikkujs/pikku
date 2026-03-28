import { basename, join, dirname, relative } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

import { pikkuVoidFunc } from '#pikku'
import { analyzeDeployment } from '../../deploy/analyzer/index.js'
import { generatePerUnitCodegen } from '../../deploy/codegen/index.js'
import { bundleUnits } from '../../deploy/bundler/index.js'
import { generatePlan } from '../../deploy/plan/index.js'
import { applyPlan } from '../../deploy/plan/executor.js'
import { formatPlan } from '../../deploy/plan/formatter.js'
import type { DeployProvider } from '../../deploy/plan/provider.js'
import type { PlanChange } from '../../deploy/plan/types.js'
import type { DeploymentUnitRole } from '../../deploy/analyzer/manifest.js'

function getCloudflareHandler(role: DeploymentUnitRole): {
  importStatement: string
  exportStatement: string
} {
  switch (role) {
    case 'http':
    case 'agent':
    case 'rpc':
    case 'workflow-orchestrator':
      return {
        importStatement: `import { createCloudflareWorkerHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWorkerHandler()`,
      }
    case 'mcp':
      return {
        importStatement: `import { createCloudflareMCPHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareMCPHandler()`,
      }
    case 'queue-consumer':
    case 'workflow-step':
      return {
        importStatement: `import { createCloudflareQueueHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareQueueHandler()`,
      }
    case 'scheduled':
      return {
        importStatement: `import { createCloudflareCronHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareCronHandler()`,
      }
    case 'channel':
      return {
        importStatement: `import { createCloudflareWebSocketHandler } from '@pikku/cloudflare'`,
        exportStatement: `export default createCloudflareWebSocketHandler()`,
      }
  }
}

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
        units: [],
        queues: [],
        scheduledTasks: [],
        secrets: [],
        variables: {},
      }
    },
    async applyChange(_change, _manifest) {
      // TODO: Delegate to provider package (e.g. @pikku/deploy-cloudflare)
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
  func: async ({ logger, config, getInspectorState }) => {
    const projectDir = config.rootDir
    const deployDir = join(projectDir, '.deploy')

    // Step 1: Analyze
    logger.info('Analyzing project...')
    const inspectorState = await getInspectorState(true)
    const projectId = basename(projectDir)
    const manifest = analyzeDeployment(inspectorState, { projectId })
    logger.info(
      `Found ${manifest.units.length} units, ${manifest.queues.length} queues, ${manifest.scheduledTasks.length} scheduled tasks`
    )

    if (manifest.units.length === 0) {
      logger.info('No deployment units found. Nothing to deploy.')
      return
    }

    // Step 2: Per-unit filtered codegen
    logger.info('Generating per-unit codegen...')
    const { unitPikkuDirs, errors: codegenErrors } =
      await generatePerUnitCodegen({
        projectDir,
        manifest,
        inspectorState,
        deployDir,
        onProgress: (unitName, status, error) => {
          if (status === 'start') {
            logger.info(`  Codegen: ${unitName}...`)
          } else if (status === 'done') {
            logger.info(`  Codegen: ${unitName} ${ANSI.green}done${ANSI.reset}`)
          } else {
            logger.error(`  Codegen: ${unitName} failed — ${error}`)
          }
        },
      })

    if (codegenErrors.length > 0) {
      for (const e of codegenErrors) {
        logger.error(`  Codegen failed: ${e.unitName} — ${e.error}`)
      }
    }

    logger.info(
      `Codegen complete: ${unitPikkuDirs.size} units${codegenErrors.length > 0 ? ` (${codegenErrors.length} failed)` : ''}`
    )

    // Step 3: Generate entry points + Bundle
    logger.info('Generating entry points and bundling...')
    const entryFiles = new Map<string, string>()
    const entriesDir = join(deployDir, 'entries')

    for (const unit of manifest.units) {
      const pikkuDir = unitPikkuDirs.get(unit.name)
      if (!pikkuDir) continue

      const entryPath = join(entriesDir, unit.name, 'entry.ts')
      const entryDir = dirname(entryPath)
      await mkdir(entryDir, { recursive: true })

      const bootstrapRelative = relative(
        entryDir,
        join(pikkuDir, 'pikku-bootstrap.gen.js')
      )
      const bootstrapPath = bootstrapRelative.startsWith('.')
        ? bootstrapRelative
        : `./${bootstrapRelative}`

      // TODO: Load handler from --provider flag. Hardcoded to Cloudflare for now.
      const handler = getCloudflareHandler(unit.role)
      const source = [
        `// Generated entry for "${unit.name}" (${unit.role})`,
        handler.importStatement,
        `import '${bootstrapPath}'`,
        ``,
        handler.exportStatement,
        ``,
      ].join('\n')

      await writeFile(entryPath, source, 'utf-8')
      entryFiles.set(unit.name, entryPath)
    }

    const { results: bundled, errors: bundleErrors } = await bundleUnits(
      projectDir,
      manifest,
      entryFiles
    )
    logger.info(
      `Bundled ${bundled.length} units${bundleErrors.length > 0 ? ` (${bundleErrors.length} failed)` : ''}`
    )

    if (bundleErrors.length > 0) {
      for (const f of bundleErrors) {
        logger.error(`  Failed: ${f.unitName} — ${f.error}`)
      }
    }

    // Step 4: Plan
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

    // Step 5: Apply
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
