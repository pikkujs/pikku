import type { DeploymentManifest } from '../analyzer/manifest.js'
import type { PlanChange } from './types.js'

export interface CurrentState {
  units: Array<{
    name: string
    functionIds: string[]
    role: string
  }>
  queues: Array<{ name: string }>
  scheduledTasks: Array<{ unitName: string; schedule: string }>
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
