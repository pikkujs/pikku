/**
 * Full dry-run deploy test: analyze → codegen per worker → bundle → plan
 *
 * Generates all files locally without hitting Cloudflare.
 * Usage: npx tsx packages/deploy/deploy-cloudflare/test-full-deploy.ts
 */

import { resolve, join } from 'node:path'
import { mkdir, rm, stat, readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { analyzeProject } from '../../cli/src/deploy/analyzer/index.js'
import { bundleWorkers } from '../../cli/src/deploy/bundler/index.js'
import { generatePlan, formatPlan } from '../../cli/src/deploy/plan/index.js'

const PROJECT_DIR = resolve(
  import.meta.dirname,
  '../../..',
  'templates/functions'
)
const DEPLOY_DIR = resolve(PROJECT_DIR, '.deploy')

const ANSI = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function runPikku(args: string): void {
  execSync(`yarn pikku ${args}`, {
    cwd: PROJECT_DIR,
    stdio: 'pipe',
  })
}

async function main() {
  // Clean previous output
  await rm(DEPLOY_DIR, { recursive: true, force: true })
  await mkdir(DEPLOY_DIR, { recursive: true })

  // Step 1: Full codegen + export state
  console.log(
    `${ANSI.bold}Step 1: Full codegen (pikku all + export state)${ANSI.reset}`
  )
  const stateFile = join(DEPLOY_DIR, 'state.json')
  runPikku(`all --state-output=${stateFile}`)
  console.log(`  ${ANSI.green}✓${ANSI.reset} Codegen complete, state saved`)

  // Step 2: Analyze
  console.log(`\n${ANSI.bold}Step 2: Analyze project${ANSI.reset}`)
  const manifest = await analyzeProject(PROJECT_DIR, {
    projectId: 'templates-functions',
    version: '1',
  })
  console.log(
    `  ${ANSI.green}✓${ANSI.reset} ${manifest.workers.length} workers, ${manifest.queues.length} queues, ${manifest.cronTriggers.length} cron triggers`
  )

  // Step 3: Per-worker filtered codegen
  console.log(
    `\n${ANSI.bold}Step 3: Per-worker codegen (filtered bootstrap)${ANSI.reset}`
  )
  const entryFiles = new Map<string, string>()

  for (const worker of manifest.workers) {
    const workerDir = join(DEPLOY_DIR, 'workers', worker.name)
    await mkdir(workerDir, { recursive: true })

    // Run filtered codegen using cached state
    const names = worker.functionIds.join(',')
    try {
      runPikku(`all --state-input=${stateFile} --names=${names}`)
      console.log(
        `  ${ANSI.green}✓${ANSI.reset} ${worker.name} (${worker.role}) → ${names}`
      )
    } catch (err) {
      console.log(
        `  ${ANSI.red}✗${ANSI.reset} ${worker.name}: ${err instanceof Error ? err.message : err}`
      )
      continue
    }

    // The filtered bootstrap is now at .pikku/pikku-bootstrap.gen.ts
    // Create an entry point that imports it
    const entryContent = [
      `// Generated entry for worker "${worker.name}" (role: ${worker.role})`,
      `import { createCloudflareWorkerHandler } from '@pikku/cloudflare'`,
      `import './.pikku/pikku-bootstrap.gen.js'`,
      ``,
      `export default createCloudflareWorkerHandler()`,
      ``,
    ].join('\n')

    const entryPath = join(PROJECT_DIR, `.deploy/entries/${worker.name}.ts`)
    await mkdir(join(PROJECT_DIR, '.deploy/entries'), { recursive: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(entryPath, entryContent, 'utf-8')
    entryFiles.set(worker.name, entryPath)
  }
  console.log(
    `  ${ANSI.green}✓${ANSI.reset} ${entryFiles.size} entry points generated`
  )

  // Step 4: Bundle
  console.log(`\n${ANSI.bold}Step 4: Bundle workers${ANSI.reset}`)
  const buildDir = join(DEPLOY_DIR, 'build')
  const { results: bundles, errors: bundleErrors } = await bundleWorkers(
    PROJECT_DIR,
    manifest,
    entryFiles,
    buildDir
  )
  console.log(
    `  ${ANSI.green}✓${ANSI.reset} ${bundles.length} bundled successfully`
  )
  if (bundleErrors.length > 0) {
    console.log(`  ${ANSI.red}✗${ANSI.reset} ${bundleErrors.length} failed:`)
    for (const err of bundleErrors) {
      console.log(`    ${ANSI.red}${err.workerName}: ${err.error}${ANSI.reset}`)
    }
  }

  for (const b of bundles) {
    const deps = Object.keys(b.externalPackages).length
    console.log(
      `  ${ANSI.dim}${b.workerName.padEnd(35)} ${formatBytes(b.bundleSizeBytes).padStart(8)}  ${deps} deps${ANSI.reset}`
    )
  }

  // Step 5: Plan
  console.log(`\n${ANSI.bold}Step 5: Deployment plan${ANSI.reset}`)
  const emptyProvider = {
    async getCurrentState(_name: string) {
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
      throw new Error('dry run')
    },
    async hasActiveWork() {
      return { active: false, pendingCount: 0 }
    },
  }
  const currentState = await emptyProvider.getCurrentState(
    'templates-functions'
  )
  const plan = await generatePlan(manifest, currentState, emptyProvider)
  console.log(formatPlan(plan))

  // Step 6: Summary
  let totalSize = 0
  for (const b of bundles) totalSize += b.bundleSizeBytes

  console.log(`\n${ANSI.bold}Summary:${ANSI.reset}`)
  console.log(
    `  ${bundles.length}/${manifest.workers.length} workers bundled (${formatBytes(totalSize)} total)`
  )
  console.log(`  ${manifest.queues.length} queues`)
  console.log(`  ${manifest.cronTriggers.length} cron triggers`)
  console.log(`  1 D1 database (pikku-runtime)`)
  console.log(`  Output: ${DEPLOY_DIR}`)

  console.log(`\n${ANSI.bold}Deploy order:${ANSI.reset}`)
  console.log(`  1. Create D1 database → get ID`)
  console.log(`  2. Create ${manifest.queues.length} queues`)
  console.log(
    `  3. Deploy ${bundles.length} workers (with D1 + queue bindings)`
  )
  console.log(`  4. Bind queue consumers`)
  console.log(`  5. Set cron triggers`)
  if (manifest.secrets.length > 0) {
    console.log(`  6. Set ${manifest.secrets.length} secrets`)
  }
  console.log(`  ${manifest.secrets.length > 0 ? '7' : '6'}. Verify health`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
