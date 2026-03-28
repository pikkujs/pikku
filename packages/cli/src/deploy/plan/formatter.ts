import type { DeploymentPlan, PlanChange, ChangeAction } from './types.js'

const ANSI = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
}

const ACTION_DISPLAY: Record<
  ChangeAction,
  { symbol: string; color: string; label: string }
> = {
  create: { symbol: '+', color: ANSI.green, label: 'create' },
  update: { symbol: '~', color: ANSI.blue, label: 'update' },
  delete: { symbol: '-', color: ANSI.red, label: 'delete' },
  drain: { symbol: '\u23F3', color: ANSI.yellow, label: 'drain' },
}

const RESOURCE_LABELS: Record<string, string> = {
  unit: 'Unit',
  queue: 'Queue',
  'scheduled-task': 'Scheduled Task',
  secret: 'Secret',
  variable: 'Variable',
}

function padRight(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length))
}

function formatChange(change: PlanChange): string {
  const display = ACTION_DISPLAY[change.action]
  const typeLabel = padRight(
    RESOURCE_LABELS[change.resourceType] ?? change.resourceType,
    16
  )
  const nameLabel = padRight(change.name, 28)
  return `  ${display.color}${display.symbol} ${padRight(display.label, 8)}${ANSI.reset} ${typeLabel} ${ANSI.bold}${nameLabel}${ANSI.reset} ${ANSI.dim}${change.reason}${ANSI.reset}`
}

export function formatPlan(plan: DeploymentPlan): string {
  const lines: string[] = []

  lines.push(`${ANSI.bold}Deployment Plan${ANSI.reset}`)
  lines.push('')

  if (plan.changes.length === 0) {
    lines.push(
      `  ${ANSI.dim}No changes. Everything is up to date.${ANSI.reset}`
    )
    return lines.join('\n')
  }

  // Group by action for clean output
  const order: ChangeAction[] = ['create', 'update', 'delete', 'drain']
  for (const action of order) {
    const group = plan.changes.filter((c) => c.action === action)
    for (const change of group) {
      lines.push(formatChange(change))
    }
  }

  if (plan.summary.unchanged > 0) {
    lines.push(
      `  ${ANSI.dim}= ${plan.summary.unchanged} resources unchanged${ANSI.reset}`
    )
  }

  lines.push('')

  const parts: string[] = []
  if (plan.summary.create > 0)
    parts.push(`${ANSI.green}${plan.summary.create} to create${ANSI.reset}`)
  if (plan.summary.update > 0)
    parts.push(`${ANSI.blue}${plan.summary.update} to update${ANSI.reset}`)
  if (plan.summary.delete > 0)
    parts.push(`${ANSI.red}${plan.summary.delete} to delete${ANSI.reset}`)
  if (plan.summary.drain > 0)
    parts.push(`${ANSI.yellow}${plan.summary.drain} to drain${ANSI.reset}`)

  lines.push(`${ANSI.bold}Summary:${ANSI.reset} ${parts.join(', ')}`)

  return lines.join('\n')
}

/** Plain text version without ANSI colors (for logs, storage) */
export function formatPlanPlain(plan: DeploymentPlan): string {
  const lines: string[] = []

  lines.push('Deployment Plan')
  lines.push('')

  if (plan.changes.length === 0) {
    lines.push('  No changes. Everything is up to date.')
    return lines.join('\n')
  }

  const order: ChangeAction[] = ['create', 'update', 'delete', 'drain']
  for (const action of order) {
    const group = plan.changes.filter((c) => c.action === action)
    for (const change of group) {
      const display = ACTION_DISPLAY[change.action]
      const typeLabel = padRight(
        RESOURCE_LABELS[change.resourceType] ?? change.resourceType,
        16
      )
      const nameLabel = padRight(change.name, 28)
      lines.push(
        `  ${display.symbol} ${padRight(display.label, 8)} ${typeLabel} ${nameLabel} ${change.reason}`
      )
    }
  }

  if (plan.summary.unchanged > 0) {
    lines.push(`  = ${plan.summary.unchanged} resources unchanged`)
  }

  lines.push('')
  const parts: string[] = []
  if (plan.summary.create > 0) parts.push(`${plan.summary.create} to create`)
  if (plan.summary.update > 0) parts.push(`${plan.summary.update} to update`)
  if (plan.summary.delete > 0) parts.push(`${plan.summary.delete} to delete`)
  if (plan.summary.drain > 0) parts.push(`${plan.summary.drain} to drain`)
  lines.push(`Summary: ${parts.join(', ')}`)

  return lines.join('\n')
}
