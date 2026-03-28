export type ChangeAction = 'create' | 'update' | 'delete' | 'drain'

export type ResourceType =
  | 'worker'
  | 'queue'
  | 'd1'
  | 'r2'
  | 'cron-trigger'
  | 'container'
  | 'secret'
  | 'variable'

export interface PlanChange {
  action: ChangeAction
  resourceType: ResourceType
  name: string
  reason: string
  details?: Record<string, unknown>
}

export interface DeploymentPlan {
  changes: PlanChange[]
  summary: {
    create: number
    update: number
    delete: number
    drain: number
    unchanged: number
  }
}

export interface ApplyResult {
  applied: Array<{
    change: PlanChange
    status: 'done' | 'error'
    error?: string
  }>
  success: boolean
}
