import chalk from 'chalk'
import { basename, join } from 'node:path'
import { readFile } from 'node:fs/promises'

import { pikkuSessionlessFunc } from '#pikku'
import { analyzeDeployment, type DeploymentManifest } from '../../deploy/analyzer/index.js'

const ROLE_COLORS: Record<string, (s: string) => string> = {
  function: chalk.blue,
  mcp: chalk.magenta,
  agent: chalk.yellow,
  channel: chalk.dim,
  'workflow-step': chalk.blue,
  workflow: chalk.blue,
}

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
    const pkg = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf-8'))
    if (pkg.name) return sanitizeProjectId(pkg.name.replace(/^@[^/]+\//, ''))
  } catch {}
  return sanitizeProjectId(basename(projectDir))
}

export const renderDeployInfo = (_s: unknown, manifest: DeploymentManifest): void => {
  console.log('')
  console.log(`${chalk.bold('Project:')} ${manifest.projectId}`)

  console.log('')
  console.log(chalk.bold(`Units (${manifest.units.length}):`))
  for (const u of manifest.units) {
    const color = ROLE_COLORS[u.role] ?? chalk.dim
    const fns = u.functionIds.join(', ')
    console.log(`  ${color(u.role.padEnd(22))} ${chalk.bold(u.name.padEnd(30))} ${chalk.dim(`[${fns}]`)}`)
    for (const handler of u.handlers) {
      if (handler.type === 'fetch' && handler.routes.length > 0) {
        for (const route of handler.routes) {
          console.log(`    ${chalk.dim(`${route.method} ${route.route}`)}`)
        }
      } else if (handler.type === 'queue') {
        console.log(`    ${chalk.dim(`queue: ${handler.queueName}`)}`)
      } else if (handler.type === 'scheduled') {
        console.log(`    ${chalk.dim(`cron: ${handler.schedule}`)}`)
      }
    }
  }

  if (manifest.queues.length > 0) {
    console.log('')
    console.log(chalk.bold(`Queues (${manifest.queues.length}):`))
    for (const q of manifest.queues) {
      console.log(`  ${q.name.padEnd(30)} ${chalk.dim(`-> ${q.consumerUnit}`)}`)
    }
  }

  if (manifest.scheduledTasks.length > 0) {
    console.log('')
    console.log(chalk.bold(`Scheduled Tasks (${manifest.scheduledTasks.length}):`))
    for (const t of manifest.scheduledTasks) {
      console.log(`  ${t.name.padEnd(30)} ${chalk.dim(`${t.schedule} -> ${t.unitName}`)}`)
    }
  }

  if (manifest.channels.length > 0) {
    console.log('')
    console.log(chalk.bold(`Channels (${manifest.channels.length}):`))
    for (const c of manifest.channels) {
      console.log(`  ${c.name.padEnd(30)} ${chalk.dim(`${c.route} -> ${c.unitName}`)}`)
    }
  }

  if (manifest.agents.length > 0) {
    console.log('')
    console.log(chalk.bold(`Agents (${manifest.agents.length}):`))
    for (const a of manifest.agents) {
      console.log(`  ${a.name.padEnd(30)} ${chalk.dim(`[${a.toolFunctionIds.join(', ')}]`)}`)
    }
  }

  if (manifest.secrets.length > 0) {
    console.log('')
    console.log(chalk.bold(`Required Secrets (${manifest.secrets.length}):`))
    for (const s of manifest.secrets) {
      console.log(`  ${chalk.yellow(s.secretId)}`)
    }
  }

  if (manifest.variables.length > 0) {
    console.log('')
    console.log(chalk.bold(`Variables (${manifest.variables.length}):`))
    for (const v of manifest.variables) {
      console.log(`  ${v.variableId}${chalk.dim(` (${v.displayName})`)}`)
    }
  }

  console.log('')
}

export const deployInfo = pikkuSessionlessFunc<{}, DeploymentManifest>({
  remote: true,
  func: async ({ logger, config, getInspectorState }) => {
    logger.info('Analyzing project...')
    const inspectorState = await getInspectorState(true)
    const projectId = await resolveProjectId(config.rootDir)
    return analyzeDeployment(inspectorState, { projectId })
  },
})
