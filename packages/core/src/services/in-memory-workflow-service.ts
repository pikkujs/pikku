import { randomUUID } from 'crypto'
import { PikkuWorkflowService } from '../wirings/workflow/pikku-workflow-service.js'
import type { SerializedError } from '../types/core.types.js'
import type {
  WorkflowRun,
  StepState,
  WorkflowStatus,
  WorkflowStepOptions,
} from '../wirings/workflow/workflow.types.js'

interface InternalStepData {
  rpcName: string | null
  data: any
  stepName: string
}

/**
 * In-memory implementation of WorkflowService for inline-only execution
 *
 * This is a lightweight workflow service that stores all state in memory.
 * It only supports inline execution (no queue workers) and is ideal for:
 * - CLI tools that need workflow-like step orchestration
 * - Testing and development
 * - Single-process applications without persistence requirements
 *
 * @example
 * ```typescript
 * const workflowService = new InMemoryWorkflowService()
 * await workflowService.startWorkflow('myWorkflow', input, rpc, { inline: true })
 * ```
 */
export class InMemoryWorkflowService extends PikkuWorkflowService {
  private runs = new Map<string, WorkflowRun>()
  private steps = new Map<string, StepState>() // keyed by `${runId}:${stepName}`
  private stepData = new Map<string, InternalStepData>() // keyed by stepId
  private stepHistory = new Map<
    string,
    Array<StepState & { stepName: string }>
  >() // keyed by runId
  private runState = new Map<string, Record<string, unknown>>() // keyed by runId
  private branchKeys = new Map<string, string>() // keyed by stepId
  private workflowVersions = new Map<string, { graph: any; source: string }>() // keyed by `${name}:${graphHash}`

  async createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string
  ): Promise<string> {
    const runId = randomUUID()
    const now = new Date()

    const run: WorkflowRun = {
      id: runId,
      workflow: workflowName,
      status: 'running',
      input,
      inline,
      graphHash,
      createdAt: now,
      updatedAt: now,
    }

    this.runs.set(runId, run)
    this.stepHistory.set(runId, [])
    this.runState.set(runId, {})

    if (inline) {
      this.registerInlineRun(runId)
    }

    return runId
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.runs.get(id) || null
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.stepHistory.get(runId) || []
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    const run = this.runs.get(id)
    if (run) {
      run.status = status
      run.updatedAt = new Date()
      if (output !== undefined) run.output = output
      if (error !== undefined) run.error = error
    }
  }

  async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    stepOptions?: WorkflowStepOptions
  ): Promise<StepState> {
    const stepId = randomUUID()
    const now = new Date()

    const step: StepState = {
      stepId,
      status: 'pending',
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay,
      createdAt: now,
      updatedAt: now,
    }

    const key = `${runId}:${stepName}`
    this.steps.set(key, step)
    this.stepData.set(stepId, { rpcName, data, stepName })

    // Add to history
    const history = this.stepHistory.get(runId) || []
    history.push({ ...step, stepName })
    this.stepHistory.set(runId, history)

    return step
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const key = `${runId}:${stepName}`
    const step = this.steps.get(key)
    if (!step) {
      return {
        stepId: '',
        status: 'pending',
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }
    return step
  }

  async setStepRunning(stepId: string): Promise<void> {
    for (const step of this.steps.values()) {
      if (step.stepId === stepId) {
        step.status = 'running'
        step.runningAt = new Date()
        step.updatedAt = new Date()
        break
      }
    }
  }

  async setStepScheduled(stepId: string): Promise<void> {
    for (const step of this.steps.values()) {
      if (step.stepId === stepId) {
        step.status = 'scheduled'
        step.scheduledAt = new Date()
        step.updatedAt = new Date()
        break
      }
    }
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    for (const step of this.steps.values()) {
      if (step.stepId === stepId) {
        step.status = 'succeeded'
        step.result = result
        step.succeededAt = new Date()
        step.updatedAt = new Date()
        break
      }
    }
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    for (const step of this.steps.values()) {
      if (step.stepId === stepId) {
        step.status = 'failed'
        step.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
        step.failedAt = new Date()
        step.updatedAt = new Date()
        break
      }
    }
  }

  async createRetryAttempt(
    failedStepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    // Find the failed step
    let failedStep: StepState | undefined
    let runId: string | undefined
    let stepName: string | undefined

    for (const [key, step] of this.steps.entries()) {
      if (step.stepId === failedStepId) {
        failedStep = step
        const parts = key.split(':')
        runId = parts[0]
        stepName = parts.slice(1).join(':')
        break
      }
    }

    if (!failedStep || !runId || !stepName) {
      throw new Error(`Step not found: ${failedStepId}`)
    }

    const failedStepData = this.stepData.get(failedStepId)
    const newStepId = randomUUID()
    const now = new Date()

    const newStep: StepState = {
      stepId: newStepId,
      status,
      attemptCount: failedStep.attemptCount + 1,
      retries: failedStep.retries,
      retryDelay: failedStep.retryDelay,
      createdAt: now,
      updatedAt: now,
    }

    if (status === 'running') {
      newStep.runningAt = now
    }

    const key = `${runId}:${stepName}`
    this.steps.set(key, newStep)

    // Copy step data to new step
    if (failedStepData) {
      this.stepData.set(newStepId, { ...failedStepData })
    }

    // Add to history
    const history = this.stepHistory.get(runId) || []
    history.push({ ...newStep, stepName })
    this.stepHistory.set(runId, history)

    return newStep
  }

  async withRunLock<T>(_id: string, fn: () => Promise<T>): Promise<T> {
    // In-memory service doesn't need locking for inline execution
    return fn()
  }

  async withStepLock<T>(
    _runId: string,
    _stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // In-memory service doesn't need locking for inline execution
    return fn()
  }

  async close(): Promise<void> {
    // Clear all in-memory state
    this.runs.clear()
    this.steps.clear()
    this.stepData.clear()
    this.stepHistory.clear()
    this.runState.clear()
    this.branchKeys.clear()
    this.workflowVersions.clear()
  }

  // Graph workflow methods

  async getCompletedGraphState(runId: string): Promise<{
    completedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const history = this.stepHistory.get(runId) || []
    const completedNodeIds = history
      .filter((s) => s.status === 'succeeded')
      .map((s) => s.stepName)

    const branchKeys: Record<string, string> = {}
    for (const [stepId, branchKey] of this.branchKeys.entries()) {
      const stepData = this.stepData.get(stepId)
      if (stepData) {
        branchKeys[stepData.stepName] = branchKey
      }
    }

    return { completedNodeIds, branchKeys }
  }

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    const existingSteps = new Set<string>()
    for (const [key] of this.steps.entries()) {
      if (key.startsWith(`${runId}:`)) {
        existingSteps.add(key.substring(runId.length + 1))
      }
    }
    return nodeIds.filter((id) => !existingSteps.has(id))
  }

  async getNodeResults(
    runId: string,
    nodeIds: string[]
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {}
    for (const nodeId of nodeIds) {
      const key = `${runId}:${nodeId}`
      const step = this.steps.get(key)
      if (step?.result !== undefined) {
        results[nodeId] = step.result
      }
    }
    return results
  }

  async setBranchKey(
    runId: string,
    nodeId: string,
    branchKey: string
  ): Promise<void> {
    const key = `${runId}:${nodeId}`
    const step = this.steps.get(key)
    if (step) {
      this.branchKeys.set(step.stepId, branchKey)
    }
  }

  async setBranchTaken(stepId: string, branchKey: string): Promise<void> {
    this.branchKeys.set(stepId, branchKey)
  }

  async updateRunState(
    runId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    const state = this.runState.get(runId) || {}
    state[name] = value
    this.runState.set(runId, state)
  }

  async getRunState(runId: string): Promise<Record<string, unknown>> {
    return this.runState.get(runId) || {}
  }

  async upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string
  ): Promise<void> {
    this.workflowVersions.set(`${name}:${graphHash}`, {
      graph,
      source,
    })
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const version = this.workflowVersions.get(`${name}:${graphHash}`)
    if (!version) return null
    return { graph: version.graph, source: version.source }
  }
}
