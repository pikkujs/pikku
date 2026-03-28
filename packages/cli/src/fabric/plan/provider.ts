import type { DeploymentManifest } from '../analyzer/manifest.js'
import type { PlanChange } from './types.js'

export interface CurrentState {
  workers: Array<{
    name: string
    functionIds: string[]
    role: string
    scriptHash?: string
  }>
  queues: Array<{ name: string }>
  d1Databases: Array<{ name: string; id: string }>
  r2Buckets: Array<{ name: string }>
  cronTriggers: Array<{ workerName: string; cron: string }>
  containers: Array<{ name: string }>
  secrets: string[]
  variables: Record<string, string>
}

export interface DeployProvider {
  /** Get current deployed state for a project */
  getCurrentState(projectId: string): Promise<CurrentState>

  /** Execute a single change from the plan */
  applyChange(change: PlanChange, manifest: DeploymentManifest): Promise<void>

  /** Check if a resource has active work (for drain vs delete decisions) */
  hasActiveWork(
    resourceName: string
  ): Promise<{ active: boolean; pendingCount: number }>
}
