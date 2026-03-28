import type { DeploymentManifest } from '../analyzer/manifest.js'
import type { CurrentState, DeployProvider } from './provider.js'
import type { DeploymentPlan, PlanChange } from './types.js'

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sorted1 = [...a].sort()
  const sorted2 = [...b].sort()
  return sorted1.every((v, i) => v === sorted2[i])
}

function diffUnits(
  manifest: DeploymentManifest,
  current: CurrentState,
  drainInfo: Map<string, number>
): PlanChange[] {
  const changes: PlanChange[] = []
  const currentByName = new Map(current.units.map((u) => [u.name, u]))
  const desiredByName = new Map(manifest.units.map((u) => [u.name, u]))

  // Create or update
  for (const desired of manifest.units) {
    const existing = currentByName.get(desired.name)
    if (!existing) {
      changes.push({
        action: 'create',
        resourceType: 'unit',
        name: desired.name,
        role: desired.role,
        reason: 'new function',
        details: { functionIds: desired.functionIds },
      })
    } else if (
      !arraysEqual(existing.functionIds, desired.functionIds) ||
      existing.role !== desired.role
    ) {
      changes.push({
        action: 'update',
        resourceType: 'unit',
        name: desired.name,
        role: desired.role,
        reason: 'code changed',
        details: { functionIds: desired.functionIds },
      })
    }
  }

  // Delete or drain
  for (const existing of current.units) {
    if (!desiredByName.has(existing.name)) {
      const pending = drainInfo.get(existing.name) ?? 0
      if (pending > 0) {
        changes.push({
          action: 'drain',
          resourceType: 'unit',
          name: existing.name,
          reason: `removed, ${pending} pending workflows`,
          details: { pendingCount: pending },
        })
      } else {
        changes.push({
          action: 'delete',
          resourceType: 'unit',
          name: existing.name,
          reason: 'removed, no active workflows',
        })
      }
    }
  }

  return changes
}

function diffSimpleResources(
  resourceType: 'queue',
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

function diffScheduledTasks(
  desired: DeploymentManifest['scheduledTasks'],
  current: CurrentState['scheduledTasks']
): PlanChange[] {
  const changes: PlanChange[] = []
  const currentByUnit = new Map(current.map((t) => [t.unitName, t.schedule]))
  const desiredByUnit = new Map(desired.map((t) => [t.unitName, t.schedule]))

  for (const d of desired) {
    const existingSchedule = currentByUnit.get(d.unitName)
    if (existingSchedule === undefined) {
      changes.push({
        action: 'create',
        resourceType: 'scheduled-task',
        name: d.name,
        reason: 'new scheduled task',
        details: { schedule: d.schedule, unitName: d.unitName },
      })
    } else if (existingSchedule !== d.schedule) {
      changes.push({
        action: 'update',
        resourceType: 'scheduled-task',
        name: d.name,
        reason: 'schedule changed',
        details: { oldSchedule: existingSchedule, newSchedule: d.schedule },
      })
    }
  }

  for (const c of current) {
    if (!desiredByUnit.has(c.unitName)) {
      changes.push({
        action: 'delete',
        resourceType: 'scheduled-task',
        name: c.unitName,
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
    manifest.units.length +
    manifest.queues.length +
    manifest.scheduledTasks.length +
    manifest.secrets.length +
    manifest.variables.length

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
  // Check drain status for units being removed
  const removedUnitNames = currentState.units
    .filter((u) => !manifest.units.some((mu) => mu.name === u.name))
    .map((u) => u.name)

  const drainInfo = new Map<string, number>()
  for (const name of removedUnitNames) {
    const { active, pendingCount } = await provider.hasActiveWork(name)
    if (active) {
      drainInfo.set(name, pendingCount)
    }
  }

  const changes: PlanChange[] = [
    ...diffUnits(manifest, currentState, drainInfo),
    ...diffSimpleResources('queue', manifest.queues, currentState.queues),
    ...diffScheduledTasks(manifest.scheduledTasks, currentState.scheduledTasks),
    ...diffSecrets(
      manifest.secrets.map((s) => s.secretId),
      currentState.secrets
    ),
    ...diffVariables(
      Object.fromEntries(
        manifest.variables.map((v) => [v.variableId, v.displayName])
      ),
      currentState.variables
    ),
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
