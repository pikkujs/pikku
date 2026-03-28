/**
 * Quick test: run the analyzer + plan against the test-app
 *
 * Usage: npx tsx packages/deploy/deploy-cloudflare/test-analyze.ts
 */

import { analyzeProject } from '../../cli/src/deploy/analyzer/index.js'
import { generatePlan, formatPlan } from '../../cli/src/deploy/plan/index.js'

import { resolve } from 'node:path'
const TEST_APP_DIR = resolve(import.meta.dirname, '../../../..', 'test-app')

async function main() {
  console.log('=== Step 1: Analyze ===\n')

  const manifest = await analyzeProject(TEST_APP_DIR, {
    projectId: 'test-app',
    version: '1',
  })

  console.log(`Project: ${manifest.projectId}`)
  console.log(`Workers: ${manifest.workers.length}`)
  console.log(`Queues: ${manifest.queues.length}`)
  console.log(`Cron Triggers: ${manifest.cronTriggers.length}`)
  console.log(`D1 Databases: ${manifest.d1Databases.length}`)
  console.log(`R2 Buckets: ${manifest.r2Buckets.length}`)
  console.log(`Secrets: ${manifest.secrets.length}`)
  console.log(`Variables: ${Object.keys(manifest.variables).length}`)
  console.log(`Containers: ${manifest.containers.length}`)

  console.log('\n--- Workers ---')
  for (const w of manifest.workers) {
    console.log(
      `  ${w.role.padEnd(22)} ${w.name.padEnd(30)} [${w.functionIds.join(', ')}]`
    )
    for (const r of w.routes) {
      console.log(`    → ${r}`)
    }
  }

  if (manifest.queues.length > 0) {
    console.log('\n--- Queues ---')
    for (const q of manifest.queues) {
      console.log(`  ${q.name} → ${q.consumerWorker}`)
    }
  }

  if (manifest.cronTriggers.length > 0) {
    console.log('\n--- Cron Triggers ---')
    for (const c of manifest.cronTriggers) {
      console.log(`  ${c.name} ${c.schedule} → ${c.workerName}`)
    }
  }

  if (manifest.secrets.length > 0) {
    console.log('\n--- Secrets ---')
    for (const s of manifest.secrets) {
      console.log(`  ${s}`)
    }
  }

  console.log('\n=== Step 2: Plan (against empty state = first deploy) ===\n')

  const emptyProvider = {
    async getCurrentState() {
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

  const currentState = await emptyProvider.getCurrentState('test-app')
  const plan = await generatePlan(manifest, currentState, emptyProvider)

  console.log(formatPlan(plan))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
