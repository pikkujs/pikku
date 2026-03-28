import { pikkuVoidFunc } from '#pikku'
import { analyzeProject } from '../../deploy/analyzer/index.js'

const ANSI = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

const ROLE_COLORS: Record<string, string> = {
  http: ANSI.blue,
  mcp: '\x1b[35m', // magenta
  'queue-consumer': '\x1b[36m', // cyan
  cron: '\x1b[35m', // violet
  agent: '\x1b[33m', // orange
  remote: ANSI.dim,
  'workflow-step': '\x1b[34m',
  'workflow-orchestrator': '\x1b[34m',
}

function padRight(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length))
}

export const deployInfo = pikkuVoidFunc({
  func: async ({ logger }) => {
    const projectDir = process.cwd()

    logger.info('Analyzing project...')
    const manifest = await analyzeProject(projectDir)

    console.log('')
    console.log(`${ANSI.bold}Project:${ANSI.reset} ${manifest.projectId}`)
    console.log('')

    // Workers
    console.log(
      `${ANSI.bold}Workers (${manifest.workers.length}):${ANSI.reset}`
    )
    for (const w of manifest.workers) {
      const color = ROLE_COLORS[w.role] ?? ANSI.dim
      const fns = w.functionIds.join(', ')
      console.log(
        `  ${color}${padRight(w.role, 22)}${ANSI.reset} ${ANSI.bold}${padRight(w.name, 30)}${ANSI.reset} ${ANSI.dim}[${fns}]${ANSI.reset}`
      )
      if (w.routes.length > 0) {
        for (const route of w.routes) {
          console.log(`    ${ANSI.dim}→ ${route}${ANSI.reset}`)
        }
      }
    }

    // Queues
    if (manifest.queues.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Queues (${manifest.queues.length}):${ANSI.reset}`
      )
      for (const q of manifest.queues) {
        console.log(
          `  ${padRight(q.name, 30)} ${ANSI.dim}→ ${q.consumerWorker}${ANSI.reset}`
        )
      }
    }

    // Cron triggers
    if (manifest.cronTriggers.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Cron Triggers (${manifest.cronTriggers.length}):${ANSI.reset}`
      )
      for (const c of manifest.cronTriggers) {
        console.log(
          `  ${padRight(c.name, 30)} ${ANSI.dim}${c.schedule} → ${c.workerName}${ANSI.reset}`
        )
      }
    }

    // D1
    if (manifest.d1Databases.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}D1 Databases (${manifest.d1Databases.length}):${ANSI.reset}`
      )
      for (const d of manifest.d1Databases) {
        console.log(`  ${d.name}`)
      }
    }

    // R2
    if (manifest.r2Buckets.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}R2 Buckets (${manifest.r2Buckets.length}):${ANSI.reset}`
      )
      for (const r of manifest.r2Buckets) {
        console.log(`  ${r.name}`)
      }
    }

    // Secrets
    if (manifest.secrets.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Required Secrets (${manifest.secrets.length}):${ANSI.reset}`
      )
      for (const s of manifest.secrets) {
        console.log(`  ${ANSI.yellow}${s}${ANSI.reset}`)
      }
    }

    // Variables
    const varKeys = Object.keys(manifest.variables)
    if (varKeys.length > 0) {
      console.log('')
      console.log(`${ANSI.bold}Variables (${varKeys.length}):${ANSI.reset}`)
      for (const [key, value] of Object.entries(manifest.variables)) {
        console.log(`  ${key}=${ANSI.dim}${value}${ANSI.reset}`)
      }
    }

    console.log('')
  },
})
