/**
 * Test: run the analyzer + plan against multiple Pikku projects
 *
 * Usage: npx tsx packages/deploy/deploy-cloudflare/test-analyze.ts
 */

import { resolve } from 'node:path'
import { analyzeProject } from '../../cli/src/deploy/analyzer/index.js'
import { generatePlan, formatPlan } from '../../cli/src/deploy/plan/index.js'

const PROJECTS = [
  {
    dir: resolve(import.meta.dirname, '../../../..', 'test-app'),
    name: 'test-app',
  },
  {
    dir: resolve(import.meta.dirname, '../../../..', 'pikku-perauset'),
    name: 'pikku-perauset',
  },
  {
    dir: resolve(import.meta.dirname, '../../..', 'templates/functions'),
    name: 'templates-functions',
  },
]

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

async function main() {
  for (const { dir, name } of PROJECTS) {
    console.log('\n' + '='.repeat(60))
    console.log(`PROJECT: ${name}`)
    console.log('='.repeat(60) + '\n')

    try {
      const manifest = await analyzeProject(dir, {
        projectId: name,
        version: '1',
      })

      console.log(`Workers: ${manifest.workers.length}`)
      console.log(`Queues: ${manifest.queues.length}`)
      console.log(`Cron Triggers: ${manifest.cronTriggers.length}`)
      console.log(`Secrets: ${manifest.secrets.length}`)

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
        console.log('\n--- Cron ---')
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

      console.log('\n--- Plan ---')
      const currentState = await emptyProvider.getCurrentState(name)
      const plan = await generatePlan(manifest, currentState, emptyProvider)
      console.log(formatPlan(plan))
    } catch (err) {
      console.error(`ERROR: ${err instanceof Error ? err.message : err}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
