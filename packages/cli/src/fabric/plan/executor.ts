import type { DeploymentManifest } from '../analyzer/manifest.js'
import type { DeployProvider } from './provider.js'
import type { ApplyResult, DeploymentPlan, PlanChange } from './types.js'

type ProgressStatus = 'start' | 'done' | 'error'

interface ApplyOptions {
  onProgress?: (
    change: PlanChange,
    status: ProgressStatus,
    error?: string
  ) => void
}

/** Execution order for resource creation */
const CREATE_ORDER: Array<PlanChange['resourceType']> = [
  'queue',
  'd1',
  'r2',
  'worker',
  'cron-trigger',
  'container',
  'secret',
  'variable',
]

function sortByOrder(
  changes: PlanChange[],
  order: Array<PlanChange['resourceType']>
): PlanChange[] {
  return [...changes].sort(
    (a, b) => order.indexOf(a.resourceType) - order.indexOf(b.resourceType)
  )
}

export async function applyPlan(
  plan: DeploymentPlan,
  manifest: DeploymentManifest,
  provider: DeployProvider,
  options?: ApplyOptions
): Promise<ApplyResult> {
  const results: ApplyResult['applied'] = []
  const { onProgress } = options ?? {}

  // Group by action
  const creates = plan.changes.filter((c) => c.action === 'create')
  const updates = plan.changes.filter((c) => c.action === 'update')
  const drains = plan.changes.filter((c) => c.action === 'drain')
  const deletes = plan.changes.filter((c) => c.action === 'delete')

  // Execute in order: create → update → secrets/variables → drain → delete
  const ordered = [
    ...sortByOrder(creates, CREATE_ORDER),
    ...sortByOrder(updates, CREATE_ORDER),
    ...drains,
    ...sortByOrder(deletes, [...CREATE_ORDER].reverse()),
  ]

  for (const change of ordered) {
    onProgress?.(change, 'start')
    try {
      await provider.applyChange(change, manifest)
      onProgress?.(change, 'done')
      results.push({ change, status: 'done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onProgress?.(change, 'error', message)
      results.push({ change, status: 'error', error: message })
    }
  }

  return {
    applied: results,
    success: results.every((r) => r.status === 'done'),
  }
}
