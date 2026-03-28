import type { DeploymentManifest } from '../analyzer/manifest.js'
import type { CurrentState, DeployProvider } from './provider.js'
import type { DeploymentPlan, PlanChange } from './types.js'

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sorted1 = [...a].sort()
  const sorted2 = [...b].sort()
  return sorted1.every((v, i) => v === sorted2[i])
}

function diffWorkers(
  manifest: DeploymentManifest,
  current: CurrentState,
  drainInfo: Map<string, number>
): PlanChange[] {
  const changes: PlanChange[] = []
  const currentByName = new Map(current.workers.map((w) => [w.name, w]))
  const desiredByName = new Map(manifest.workers.map((w) => [w.name, w]))

  // Create or update
  for (const desired of manifest.workers) {
    const existing = currentByName.get(desired.name)
    if (!existing) {
      changes.push({
        action: 'create',
        resourceType: 'worker',
        name: desired.name,
        reason: 'new function',
        details: { role: desired.role, functionIds: desired.functionIds },
      })
    } else if (
      !arraysEqual(existing.functionIds, desired.functionIds) ||
      existing.role !== desired.role
    ) {
      changes.push({
        action: 'update',
        resourceType: 'worker',
        name: desired.name,
        reason: 'code changed',
        details: { role: desired.role, functionIds: desired.functionIds },
      })
    }
  }

  // Delete or drain
  for (const existing of current.workers) {
    if (!desiredByName.has(existing.name)) {
      const pending = drainInfo.get(existing.name) ?? 0
      if (pending > 0) {
        changes.push({
          action: 'drain',
          resourceType: 'worker',
          name: existing.name,
          reason: `removed, ${pending} pending workflows`,
          details: { pendingCount: pending },
        })
      } else {
        changes.push({
          action: 'delete',
          resourceType: 'worker',
          name: existing.name,
          reason: 'removed, no active workflows',
        })
      }
    }
  }

  return changes
}

function diffSimpleResources(
  resourceType: 'queue' | 'd1' | 'r2' | 'container',
  desired: Array<{ name: string }>,
  current: Array<{ name: string }>
): PlanChange[] {
  const changes: PlanChange[] = []
  const currentNames = new Set(current.map((r) => r.name))
  const desiredNames = new Set(desired.map((r) => r.name))

  for (const r of desired) {
    if (!currentNames.has(r.name)) {
      changes.push({
        action: 'create',
        resourceType,
        name: r.name,
        reason: 'new',
      })
    }
  }

  for (const r of current) {
    if (!desiredNames.has(r.name)) {
      changes.push({
        action: 'delete',
        resourceType,
        name: r.name,
        reason: 'removed',
      })
    }
  }

  return changes
}

function diffCronTriggers(
  desired: DeploymentManifest['cronTriggers'],
  current: CurrentState['cronTriggers']
): PlanChange[] {
  const changes: PlanChange[] = []
  const currentByWorker = new Map(current.map((c) => [c.workerName, c.cron]))
  const desiredByWorker = new Map(
    desired.map((c) => [c.workerName, c.schedule])
  )

  for (const d of desired) {
    const existingCron = currentByWorker.get(d.workerName)
    if (existingCron === undefined) {
      changes.push({
        action: 'create',
        resourceType: 'cron-trigger',
        name: d.name,
        reason: 'new cron',
        details: { schedule: d.schedule, workerName: d.workerName },
      })
    } else if (existingCron !== d.schedule) {
      changes.push({
        action: 'update',
        resourceType: 'cron-trigger',
        name: d.name,
        reason: 'schedule changed',
        details: { oldSchedule: existingCron, newSchedule: d.schedule },
      })
    }
  }

  for (const c of current) {
    if (!desiredByWorker.has(c.workerName)) {
      changes.push({
        action: 'delete',
        resourceType: 'cron-trigger',
        name: c.workerName,
        reason: 'removed',
      })
    }
  }

  return changes
}

function diffSecrets(desired: string[], current: string[]): PlanChange[] {
  const changes: PlanChange[] = []
  const currentSet = new Set(current)
  const desiredSet = new Set(desired)

  for (const s of desired) {
    if (!currentSet.has(s)) {
      changes.push({
        action: 'create',
        resourceType: 'secret',
        name: s,
        reason: 'new secret',
      })
    }
  }

  for (const s of current) {
    if (!desiredSet.has(s)) {
      changes.push({
        action: 'delete',
        resourceType: 'secret',
        name: s,
        reason: 'removed',
      })
    }
  }

  return changes
}

function diffVariables(
  desired: Record<string, string>,
  current: Record<string, string>
): PlanChange[] {
  const changes: PlanChange[] = []

  for (const [key, value] of Object.entries(desired)) {
    if (!(key in current)) {
      changes.push({
        action: 'create',
        resourceType: 'variable',
        name: key,
        reason: 'new variable',
      })
    } else if (current[key] !== value) {
      changes.push({
        action: 'update',
        resourceType: 'variable',
        name: key,
        reason: 'value changed',
      })
    }
  }

  for (const key of Object.keys(current)) {
    if (!(key in desired)) {
      changes.push({
        action: 'delete',
        resourceType: 'variable',
        name: key,
        reason: 'removed',
      })
    }
  }

  return changes
}

function countUnchanged(
  manifest: DeploymentManifest,
  changes: PlanChange[]
): number {
  const totalDesired =
    manifest.workers.length +
    manifest.queues.length +
    manifest.d1Databases.length +
    manifest.r2Buckets.length +
    manifest.cronTriggers.length +
    manifest.containers.length +
    manifest.secrets.length +
    Object.keys(manifest.variables).length

  const changedNames = new Set(changes.map((c) => c.name))
  // Rough count: total desired minus those that appear in changes
  const createOrUpdate = changes.filter(
    (c) => c.action === 'create' || c.action === 'update'
  ).length
  return Math.max(0, totalDesired - createOrUpdate)
}

export async function generatePlan(
  manifest: DeploymentManifest,
  currentState: CurrentState,
  provider: DeployProvider
): Promise<DeploymentPlan> {
  // Check drain status for workers being removed
  const removedWorkerNames = currentState.workers
    .filter((w) => !manifest.workers.some((mw) => mw.name === w.name))
    .map((w) => w.name)

  const drainInfo = new Map<string, number>()
  for (const name of removedWorkerNames) {
    const { active, pendingCount } = await provider.hasActiveWork(name)
    if (active) {
      drainInfo.set(name, pendingCount)
    }
  }

  const changes: PlanChange[] = [
    ...diffWorkers(manifest, currentState, drainInfo),
    ...diffSimpleResources('queue', manifest.queues, currentState.queues),
    ...diffSimpleResources(
      'd1',
      manifest.d1Databases,
      currentState.d1Databases
    ),
    ...diffSimpleResources('r2', manifest.r2Buckets, currentState.r2Buckets),
    ...diffSimpleResources(
      'container',
      manifest.containers,
      currentState.containers
    ),
    ...diffCronTriggers(manifest.cronTriggers, currentState.cronTriggers),
    ...diffSecrets(manifest.secrets, currentState.secrets),
    ...diffVariables(manifest.variables, currentState.variables),
  ]

  const summary = {
    create: changes.filter((c) => c.action === 'create').length,
    update: changes.filter((c) => c.action === 'update').length,
    delete: changes.filter((c) => c.action === 'delete').length,
    drain: changes.filter((c) => c.action === 'drain').length,
    unchanged: countUnchanged(manifest, changes),
  }

  return { changes, summary }
}
