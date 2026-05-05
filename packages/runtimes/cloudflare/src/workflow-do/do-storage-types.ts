import type {
  StepState,
  StepStatus,
  WorkflowRun,
  WorkflowVersionStatus,
} from '@pikku/core/workflow'
import type { SerializedError } from '@pikku/core'

/** Stored under the `run` key. */
export interface DoRunRecord extends Omit<
  WorkflowRun,
  'createdAt' | 'updatedAt'
> {
  createdAt: number
  updatedAt: number
}

/** Stored under `step:${stepId}`. */
export interface DoStepRecord extends Omit<
  StepState,
  | 'createdAt'
  | 'updatedAt'
  | 'runningAt'
  | 'scheduledAt'
  | 'succeededAt'
  | 'failedAt'
> {
  stepName: string
  rpcName: string | null
  data?: unknown
  branchTaken?: string
  createdAt: number
  updatedAt: number
  runningAt?: number
  scheduledAt?: number
  succeededAt?: number
  failedAt?: number
}

/** Stored under `step:history:${historyId}`. */
export interface DoStepHistoryRecord {
  historyId: string
  stepId: string
  status: StepStatus
  result?: unknown
  error?: SerializedError | null
  createdAt: number
}

/** Stored under `alarm:next`. Records *why* the next alarm is set. */
export type DoPendingAlarm =
  | { kind: 'sleep'; stepId: string }
  | { kind: 'orchestrator-retry' }
  | { kind: 'step-retry'; stepId: string }
  | { kind: 'retention' }

/** Stored under `version:${name}:${graphHash}` (per-run cache). */
export interface DoWorkflowVersionRecord {
  name: string
  graphHash: string
  graph: any
  source: string
  status: WorkflowVersionStatus
}
