import { promises as fs } from 'fs'
import { join } from 'path'
import {
  WorkflowStateService,
  WorkflowMeta,
  WorkflowRun,
  WorkflowStatus,
  StepState,
  SerializedError,
} from '../wirings/workflow/workflow-state.types.js'

/**
 * File-based implementation of WorkflowStateService.
 * Stores workflow runs and steps as JSON files in a directory.
 * Suitable for serverless/multi-process environments with shared filesystem.
 */
export class FileWorkflowStateService extends WorkflowStateService {
  private storageDir: string

  constructor(storageDir: string = '/tmp/pikku-workflows') {
    super()
    this.storageDir = storageDir
  }

  private async ensureDir(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true })
    } catch (err) {
      // Directory might already exist, ignore error
    }
  }

  private getRunPath(runId: string): string {
    return join(this.storageDir, 'runs', `${runId}.json`)
  }

  private getStepPath(runId: string, stepName: string): string {
    return join(this.storageDir, 'steps', runId, `${stepName}.json`)
  }

  private getLockPath(runId: string): string {
    return join(this.storageDir, 'locks', `${runId}.lock`)
  }

  private generateRunId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substring(7)}`
  }

  /**
   * Create a new workflow run
   */
  async createRun(meta: WorkflowMeta, input: any): Promise<string> {
    await this.ensureDir(join(this.storageDir, 'runs'))
    await this.ensureDir(join(this.storageDir, 'steps'))

    const runId = this.generateRunId()
    const now = Date.now()

    const run: WorkflowRun = {
      id: runId,
      workflow: meta.name,
      status: 'running',
      meta,
      input,
      createdAt: now,
      updatedAt: now,
    }

    await fs.writeFile(this.getRunPath(runId), JSON.stringify(run, null, 2))

    // Create steps directory for this run
    await this.ensureDir(join(this.storageDir, 'steps', runId))

    return runId
  }

  /**
   * Get a workflow run by ID
   */
  async getRun(id: string): Promise<WorkflowRun | null> {
    try {
      const content = await fs.readFile(this.getRunPath(id), 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      return null
    }
  }

  /**
   * Update workflow run status
   */
  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    const run = await this.getRun(id)
    if (!run) {
      throw new Error(`Workflow run not found: ${id}`)
    }

    run.status = status
    run.updatedAt = Date.now()

    if (output !== undefined) {
      run.output = output
    }

    if (error !== undefined) {
      run.error = error
    }

    await fs.writeFile(this.getRunPath(id), JSON.stringify(run, null, 2))
  }

  /**
   * Get step state by cache key
   */
  async getStepState(runId: string, stepName: string): Promise<StepState> {
    try {
      const content = await fs.readFile(
        this.getStepPath(runId, stepName),
        'utf-8'
      )
      return JSON.parse(content)
    } catch (err) {
      // Step doesn't exist yet, return pending state
      return {
        status: 'pending',
        updatedAt: Date.now(),
      }
    }
  }

  /**
   * Mark step as scheduled
   */
  async setStepScheduled(runId: string, stepName: string): Promise<void> {
    const state: StepState = {
      status: 'scheduled',
      updatedAt: Date.now(),
    }
    await fs.writeFile(
      this.getStepPath(runId, stepName),
      JSON.stringify(state, null, 2)
    )
  }

  /**
   * Store step result
   */
  async setStepResult(
    runId: string,
    stepName: string,
    result: any
  ): Promise<void> {
    const state: StepState = {
      status: 'done',
      result,
      updatedAt: Date.now(),
    }
    await fs.writeFile(
      this.getStepPath(runId, stepName),
      JSON.stringify(state, null, 2)
    )
  }

  /**
   * Store step error
   */
  async setStepError(
    runId: string,
    stepName: string,
    error: Error
  ): Promise<void> {
    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    const state: StepState = {
      status: 'error',
      error: serializedError,
      updatedAt: Date.now(),
    }

    await fs.writeFile(
      this.getStepPath(runId, stepName),
      JSON.stringify(state, null, 2)
    )
  }

  /**
   * Execute function within a run lock
   * Simple file-based locking mechanism
   */
  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    await this.ensureDir(join(this.storageDir, 'locks'))

    const lockPath = this.getLockPath(id)
    const maxRetries = 10
    const retryDelay = 100 // ms

    // Try to acquire lock
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Try to create lock file exclusively
        await fs.writeFile(lockPath, Date.now().toString(), { flag: 'wx' })
        break
      } catch (err) {
        if (i === maxRetries - 1) {
          throw new Error(`Failed to acquire lock for workflow run: ${id}`)
        }
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }

    try {
      // Execute the function
      return await fn()
    } finally {
      // Release lock
      try {
        await fs.unlink(lockPath)
      } catch (err) {
        // Lock file might not exist, ignore error
      }
    }
  }

  /**
   * Close any open connections (no-op for file-based storage)
   */
  async close(): Promise<void> {
    // Nothing to close for file-based storage
  }
}
