import { basename } from 'node:path'

import { pikkuVoidFunc } from '#pikku'
import { analyzeDeployment } from '../../deploy/analyzer/index.js'

const ANSI = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

const ROLE_COLORS: Record<string, string> = {
  function: ANSI.blue,
  mcp: '\x1b[35m', // magenta
  agent: '\x1b[33m', // orange
  channel: ANSI.dim,
  'workflow-step': '\x1b[34m',
  workflow: '\x1b[34m',
}

function padRight(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length))
}

export const deployInfo = pikkuVoidFunc({
  func: async ({ logger, config, getInspectorState }) => {
    logger.info('Analyzing project...')
    const inspectorState = await getInspectorState(true)
    const projectId = basename(config.rootDir)
    const manifest = analyzeDeployment(inspectorState, { projectId })

    console.log('')
    console.log(`${ANSI.bold}Project:${ANSI.reset} ${manifest.projectId}`)
    console.log('')

    // Units
    console.log(`${ANSI.bold}Units (${manifest.units.length}):${ANSI.reset}`)
    for (const u of manifest.units) {
      const color = ROLE_COLORS[u.role] ?? ANSI.dim
      const fns = u.functionIds.join(', ')
      console.log(
        `  ${color}${padRight(u.role, 22)}${ANSI.reset} ${ANSI.bold}${padRight(u.name, 30)}${ANSI.reset} ${ANSI.dim}[${fns}]${ANSI.reset}`
      )
      for (const handler of u.handlers) {
        if (handler.type === 'fetch' && handler.routes.length > 0) {
          for (const route of handler.routes) {
            console.log(
              `    ${ANSI.dim}${route.method} ${route.route}${ANSI.reset}`
            )
          }
        } else if (handler.type === 'queue') {
          console.log(`    ${ANSI.dim}queue: ${handler.queueName}${ANSI.reset}`)
        } else if (handler.type === 'scheduled') {
          console.log(`    ${ANSI.dim}cron: ${handler.schedule}${ANSI.reset}`)
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
          `  ${padRight(q.name, 30)} ${ANSI.dim}-> ${q.consumerUnit}${ANSI.reset}`
        )
      }
    }

    // Scheduled tasks
    if (manifest.scheduledTasks.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Scheduled Tasks (${manifest.scheduledTasks.length}):${ANSI.reset}`
      )
      for (const t of manifest.scheduledTasks) {
        console.log(
          `  ${padRight(t.name, 30)} ${ANSI.dim}${t.schedule} -> ${t.unitName}${ANSI.reset}`
        )
      }
    }

    // Channels
    if (manifest.channels.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Channels (${manifest.channels.length}):${ANSI.reset}`
      )
      for (const c of manifest.channels) {
        console.log(
          `  ${padRight(c.name, 30)} ${ANSI.dim}${c.route} -> ${c.unitName}${ANSI.reset}`
        )
      }
    }

    // Agents
    if (manifest.agents.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Agents (${manifest.agents.length}):${ANSI.reset}`
      )
      for (const a of manifest.agents) {
        const tools = a.toolFunctionIds.join(', ')
        console.log(
          `  ${padRight(a.name, 30)} ${ANSI.dim}[${tools}]${ANSI.reset}`
        )
      }
    }

    // Secrets
    if (manifest.secrets.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Required Secrets (${manifest.secrets.length}):${ANSI.reset}`
      )
      for (const s of manifest.secrets) {
        console.log(`  ${ANSI.yellow}${s.secretId}${ANSI.reset}`)
      }
    }

    // Variables
    if (manifest.variables.length > 0) {
      console.log('')
      console.log(
        `${ANSI.bold}Variables (${manifest.variables.length}):${ANSI.reset}`
      )
      for (const v of manifest.variables) {
        console.log(
          `  ${v.variableId}${ANSI.dim} (${v.displayName})${ANSI.reset}`
        )
      }
    }

    console.log('')
  },
})
