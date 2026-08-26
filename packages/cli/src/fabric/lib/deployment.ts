import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'
import type { GetDeploymentStatusOutput } from '../sdk/rpc-map.gen.d.js'

type MissingConfigEntry = GetDeploymentStatusOutput['missingSecrets'][number]

const IN_FLIGHT = new Set(['queued', 'planning', 'building', 'deploying'])
const SUCCEEDED = new Set(['active'])
const FAILED = new Set([
  'failed',
  'error',
  'timed_out',
  'cancelled',
  'rolled_back',
  'stopped',
  'archived',
])

export type BlockedReason =
  | 'awaiting_approval'
  | 'needs_config'
  | 'needs_attention'
  | 'unknown'

export type StatusClass = 'in_flight' | 'succeeded' | 'failed' | 'blocked'

export function classifyStatus(status: string): StatusClass {
  if (SUCCEEDED.has(status)) return 'succeeded'
  if (FAILED.has(status)) return 'failed'
  if (status === 'suspended') return 'blocked'
  if (IN_FLIGHT.has(status)) return 'in_flight'
  return 'in_flight'
}

export function blockedReason(statusReason: string | null): BlockedReason {
  if (
    statusReason === 'awaiting_approval' ||
    statusReason === 'needs_config' ||
    statusReason === 'needs_attention'
  ) {
    return statusReason
  }
  return 'unknown'
}

export function isApprovable(reason: BlockedReason): boolean {
  return reason === 'awaiting_approval'
}

export function stateLabel(status: string, statusReason: string | null): string {
  if (status === 'suspended') {
    if (statusReason === 'needs_attention') return 'needs attention'
    if (statusReason === 'needs_config') return 'config required'
    return 'planned'
  }
  if (status === 'active') return 'live'
  if (status === 'rolled_back') return 'rolled back'
  if (status === 'timed_out') return 'timed out'
  return status
}

export function blockedSummary(reason: BlockedReason): string {
  switch (reason) {
    case 'needs_attention':
      return 'Plan needs attention before it can deploy'
    case 'needs_config':
      return 'Required config missing — set values before approving'
    case 'awaiting_approval':
      return 'Plan ready — approve to deploy'
    default:
      return 'Deployment is suspended'
  }
}

/**
 * What to tell someone whose deploy is blocked on config they have not set.
 *
 * Secrets and variables go missing in the same way and are set by two different
 * commands: `pikku fabric secrets set` seals a value the stage can never read
 * back, `pikku fabric variables set` writes one it can. Naming one command for
 * both sends anyone blocked on the other kind to a command that refuses their
 * value, which reads as the command being broken rather than as the wrong one.
 */
export function missingConfigHints(
  missingSecrets: readonly { name: string }[] | undefined,
  missingVariables: readonly { name: string }[] | undefined
): string[] {
  const secrets = missingSecrets ?? []
  const variables = missingVariables ?? []
  const hints: string[] = []
  if (secrets.length > 0) {
    hints.push(
      `Set the secret${secrets.length > 1 ? 's' : ''} with \`pikku fabric secrets set <name>\`: ${secrets.map((s) => s.name).join(', ')}.`
    )
  }
  if (variables.length > 0) {
    hints.push(
      `Set the variable${variables.length > 1 ? 's' : ''} with \`pikku fabric variables set <name> <value>\`: ${variables.map((v) => v.name).join(', ')}.`
    )
  }
  if (hints.length === 0) {
    hints.push(
      'Set the missing values with `pikku fabric secrets set <name>` or `pikku fabric variables set <name> <value>`.'
    )
  }
  return hints
}

export interface DeploymentStatus {
  status: string
  statusReason: string | null
  stageId: string
  hostname: string | null
  missingSecrets: MissingConfigEntry[]
  missingVariables: MissingConfigEntry[]
}

export async function readDeploymentStatus(
  rpc: PikkuRPC,
  deploymentId: string
): Promise<DeploymentStatus> {
  const s = await rpc.invoke('getDeploymentStatus', { deploymentId })
  return {
    status: s.status,
    statusReason: s.statusReason,
    stageId: s.stageId,
    hostname: s.hostname,
    missingSecrets: s.missingSecrets,
    missingVariables: s.missingVariables,
  }
}

export async function approveDeployment(
  rpc: PikkuRPC,
  deploymentId: string
): Promise<boolean> {
  const { resumed } = await rpc.invoke('applyDeployment', { deploymentId })
  return resumed
}

export interface MigrationRisk {
  name: string
  level: 'destructive' | 'safe'
  reasons: string[]
}

function parseMigrationRisks(plan: unknown): MigrationRisk[] {
  const raw = (plan as Record<string, unknown> | null | undefined)
    ?.migrationRisks
  if (!Array.isArray(raw)) return []
  const risks: MigrationRisk[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { name, level, reasons } = entry as Record<string, unknown>
    if (typeof name !== 'string') continue
    if (level !== 'destructive' && level !== 'safe') continue
    risks.push({
      name,
      level,
      reasons: Array.isArray(reasons)
        ? reasons.filter((r): r is string => typeof r === 'string')
        : [],
    })
  }
  return risks
}

export function destructiveMigrations(
  changes: DeploymentChanges | null | undefined
): MigrationRisk[] {
  return (changes?.migrationRisks ?? []).filter(
    (r) => r.level === 'destructive'
  )
}

export interface DeploymentChanges {
  unitsAdded: string[]
  unitsRemoved: string[]
  handlersAdded: string[]
  handlersRemoved: string[]
  workflowsAdded: string[]
  workflowsRemoved: string[]
  workflowsChanged: string[]
  functionsAdded: string[]
  functionsRemoved: string[]
  secretsChanged: string[]
  variablesChanged: string[]
  pendingMigrations: string[]
  migrationRisks: MigrationRisk[]
}

export function changesAreEmpty(changes: DeploymentChanges): boolean {
  return Object.values(changes).every((list) => list.length === 0)
}

const handlerNames = (
  entries: { unit: string; kind: string; id: string }[] | undefined
): string[] => (entries ?? []).map((h) => `${h.unit}/${h.id}`)

export interface DeploymentDescription {
  branch: string
  stageId: string
  gitSha: string | null
  status: string
  statusReason: string | null
  url: string | null
  changes: DeploymentChanges | null
}

export async function describeDeployment(
  rpc: PikkuRPC,
  projectId: string,
  deploymentId: string
): Promise<DeploymentDescription | null> {
  const { stages } = await rpc.invoke('getProjectDeployments', {
    projectId,
    includeDismissed: true,
  })
  for (const stage of stages) {
    for (const deployment of stage.deployments) {
      if (deployment.deploymentId !== deploymentId) continue

      const diff = deployment.diff
      const executed = new Set(
        (deployment.migrations ?? []).map((m) => m.migrationName)
      )
      const planned = deployment.plan?.pendingMigrations
      const pendingMigrations = Array.isArray(planned)
        ? planned
            .filter((m): m is string => typeof m === 'string')
            .filter((m) => !executed.has(m))
        : []

      const pending = new Set(pendingMigrations)
      const migrationRisks = parseMigrationRisks(deployment.plan).filter((r) =>
        pending.has(r.name)
      )

      const changes: DeploymentChanges | null = diff
        ? {
            unitsAdded: diff.units.added,
            unitsRemoved: diff.units.removed,
            handlersAdded: handlerNames(diff.handlers.added),
            handlersRemoved: handlerNames(diff.handlers.removed),
            workflowsAdded: diff.workflows.added,
            workflowsRemoved: diff.workflows.removed,
            workflowsChanged: diff.workflows.hashChanged,
            functionsAdded: diff.contracts.addedFunctions,
            functionsRemoved: diff.contracts.removedFunctions,
            secretsChanged: [
              ...diff.secrets.added,
              ...diff.secrets.removed,
              ...diff.secrets.modified,
            ],
            variablesChanged: [
              ...diff.variables.added,
              ...diff.variables.removed,
              ...diff.variables.modified,
            ],
            pendingMigrations,
            migrationRisks,
          }
        : pendingMigrations.length > 0
          ? {
              unitsAdded: [],
              unitsRemoved: [],
              handlersAdded: [],
              handlersRemoved: [],
              workflowsAdded: [],
              workflowsRemoved: [],
              workflowsChanged: [],
              functionsAdded: [],
              functionsRemoved: [],
              secretsChanged: [],
              variablesChanged: [],
              pendingMigrations,
              migrationRisks,
            }
          : null

      return {
        branch: stage.branch,
        stageId: stage.stageId,
        gitSha: deployment.gitSha,
        status: deployment.status,
        statusReason: deployment.statusReason ?? null,
        url: stage.url,
        changes,
      }
    }
  }
  return null
}

export interface DeployedWorker {
  name: string
  role: string
  status: string
}

export async function readWorkers(
  rpc: PikkuRPC,
  stageId: string
): Promise<DeployedWorker[]> {
  const { workers } = await rpc.invoke('listDeploymentWorkers', { stageId })
  return workers.map(({ name, role, status }) => ({ name, role, status }))
}

export type ProgressEvent =
  | { event: 'created'; deploymentId: string; branch: string; ref: string }
  | { event: 'attached'; deploymentId: string; status: string }
  | {
      event: 'status'
      deploymentId: string
      status: string
      statusReason: string | null
      elapsedMs: number
    }
  | {
      event: 'blocked'
      deploymentId: string
      reason: BlockedReason
      missingSecrets: string[]
      missingVariables: string[]
    }
  | { event: 'approved'; deploymentId: string }

export type WaitOutcome = 'succeeded' | 'failed' | 'blocked' | 'timeout'

export interface WaitResult {
  outcome: WaitOutcome
  status: string
  statusReason: string | null
  stageId: string
  hostname: string | null
  reason: BlockedReason | null
  missingSecrets: MissingConfigEntry[]
  missingVariables: MissingConfigEntry[]
  approved: boolean
  elapsedMs: number
}

export interface WaitOptions {
  rpc: PikkuRPC
  deploymentId: string
  timeoutMs: number
  approve: (status: DeploymentStatus) => Promise<boolean>
  onEvent: (event: ProgressEvent) => void
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const RESUME_GRACE_MS = 30_000

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function waitForDeployment({
  rpc,
  deploymentId,
  timeoutMs,
  approve,
  onEvent,
  sleep = defaultSleep,
  now = Date.now,
}: WaitOptions): Promise<WaitResult> {
  const startedAt = now()
  const elapsed = () => now() - startedAt
  let delay = 2_000
  let lastStatus: string | null = null
  let approved = false
  let approvedAt = 0
  let lastBlockedReason: BlockedReason | null = null

  const settle = (
    status: DeploymentStatus,
    outcome: WaitOutcome,
    reason: BlockedReason | null
  ): WaitResult => ({
    outcome,
    status: status.status,
    statusReason: status.statusReason,
    stageId: status.stageId,
    hostname: status.hostname,
    reason,
    missingSecrets: status.missingSecrets,
    missingVariables: status.missingVariables,
    approved,
    elapsedMs: elapsed(),
  })

  let latest = await readDeploymentStatus(rpc, deploymentId)

  while (true) {
    if (latest.status !== lastStatus) {
      lastStatus = latest.status
      onEvent({
        event: 'status',
        deploymentId,
        status: latest.status,
        statusReason: latest.statusReason,
        elapsedMs: elapsed(),
      })
    }

    const klass = classifyStatus(latest.status)
    if (klass === 'succeeded') return settle(latest, 'succeeded', null)
    if (klass === 'failed') return settle(latest, 'failed', null)

    if (klass === 'blocked') {
      const reason = blockedReason(latest.statusReason)
      if (reason !== lastBlockedReason) {
        lastBlockedReason = reason
        onEvent({
          event: 'blocked',
          deploymentId,
          reason,
          missingSecrets: latest.missingSecrets.map((m) => m.name),
          missingVariables: latest.missingVariables.map((m) => m.name),
        })
      }
      if (!isApprovable(reason)) {
        return settle(latest, 'blocked', reason)
      }
      if (approved) {
        if (elapsed() - approvedAt >= RESUME_GRACE_MS) {
          return settle(latest, 'blocked', reason)
        }
      } else {
        if (!(await approve(latest))) {
          return settle(latest, 'blocked', reason)
        }
        await approveDeployment(rpc, deploymentId)
        approved = true
        approvedAt = elapsed()
        onEvent({ event: 'approved', deploymentId })
        delay = 2_000
        latest = await readDeploymentStatus(rpc, deploymentId)
        continue
      }
    }

    const remaining = timeoutMs - elapsed()
    if (remaining <= 0) return settle(latest, 'timeout', null)
    await sleep(Math.min(delay, remaining))
    delay = Math.min(delay * 1.5, 10_000)
    latest = await readDeploymentStatus(rpc, deploymentId)
  }
}
