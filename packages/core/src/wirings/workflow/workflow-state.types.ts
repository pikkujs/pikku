import { WorkflowStepMeta } from './workflow.types.js'

/**
 * Workflow run status
 */
export type WorkflowStatus = 'running' | 'completed' | 'failed'

/**
 * Workflow step status
 */
export type StepStatus = 'pending' | 'scheduled' | 'done' | 'error'

/**
 * Serialized error for storage
 */
export interface SerializedError {
  message: string
  stack?: string
  code?: string
  [key: string]: any
}

/**
 * Workflow metadata (frozen at run creation)
 */
export interface WorkflowMeta {
  /** Workflow name */
  name: string
  /** Description */
  description?: string
  /** Execution mode */
  executionMode: 'inline' | 'remote'
  /** Discovered steps from inspector */
  steps: WorkflowStepMeta[]
  /** Tags */
  tags?: string[]
}

/**
 * Workflow run representation
 */
export interface WorkflowRun {
  /** Unique run ID */
  id: string
  /** Workflow name */
  workflow: string
  /** Current status */
  status: WorkflowStatus
  /** Frozen metadata from creation */
  meta: WorkflowMeta
  /** Input data */
  input: any
  /** Output data (if completed) */
  output?: any
  /** Error (if failed) */
  error?: SerializedError
  /** Creation timestamp */
  createdAt: number
  /** Last update timestamp */
  updatedAt: number
}

/**
 * Step state representation
 */
export interface StepState {
  /** Step status */
  status: StepStatus
  /** Step result (if done) */
  result?: any
  /** Step error (if error) */
  error?: SerializedError
  /** Last update timestamp */
  updatedAt: number
}

/**
 * Abstract workflow state service
 * Implementations provide pluggable storage backends (SQLite, PostgreSQL, etc.)
 */
export abstract class WorkflowStateService {
  /**
   * Create a new workflow run
   * @param meta - Workflow metadata (frozen at creation)
   * @param input - Input data for the workflow
   * @returns Run ID
   */
  abstract createRun(meta: WorkflowMeta, input: any): Promise<string>

  /**
   * Get a workflow run by ID
   * @param id - Run ID
   * @returns Workflow run or null if not found
   */
  abstract getRun(id: string): Promise<WorkflowRun | null>

  /**
   * Update workflow run status
   * @param id - Run ID
   * @param status - New status
   */
  abstract updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>

  /**
   * Get step state by cache key
   * @param runId - Run ID
   * @param stepName - Step cache key (from workflow.do)
   * @returns Step state
   */
  abstract getStepState(runId: string, stepName: string): Promise<StepState>

  /**
   * Mark step as scheduled (queued for execution)
   * @param runId - Run ID
   * @param stepName - Step cache key
   */
  abstract setStepScheduled(runId: string, stepName: string): Promise<void>

  /**
   * Store step result
   * @param runId - Run ID
   * @param stepName - Step cache key
   * @param result - Step result
   */
  abstract setStepResult(
    runId: string,
    stepName: string,
    result: any
  ): Promise<void>

  /**
   * Store step error
   * @param runId - Run ID
   * @param stepName - Step cache key
   * @param error - Error object
   */
  abstract setStepError(
    runId: string,
    stepName: string,
    error: Error
  ): Promise<void>

  /**
   * Execute function within a run lock to prevent concurrent modifications
   * @param id - Run ID
   * @param fn - Function to execute
   * @returns Function result
   */
  abstract withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>

  /**
   * Close any open connections
   */
  abstract close(): Promise<void>
}
