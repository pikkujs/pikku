import { randomUUID } from 'crypto'
import { PikkuWorkflowService } from '../wirings/workflow/pikku-workflow-service.js'
import type { SerializedError } from '../types/core.types.js'
import type {
  WorkflowPlannedStep,
  WorkflowRun,
  WorkflowRunService,
  WorkflowRunWire,
  StepState,
  WorkflowStatus,
  WorkflowVersionStatus,
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
 * await workflowService.startWorkflow('myWorkflow', input, { type: 'cli' }, rpc, { inline: true })
 * ```
 */
export class InMemoryWorkflowService
  extends PikkuWorkflowService
  implements WorkflowRunService
{
  private runs = new Map<string, WorkflowRun>()
  private steps = new Map<string, StepState>() // keyed by `${runId}:${stepName}`
  private stepData = new Map<string, InternalStepData>() // keyed by stepId
  private stepHistory = new Map<
    string,
    Array<StepState & { stepName: string }>
  >() // keyed by runId
  private runState = new Map<string, Record<string, unknown>>() // keyed by runId
  private branchKeys = new Map<string, string>() // keyed by stepId
  private workflowVersions = new Map<
    string,
    { graph: any; source: string; status: WorkflowVersionStatus }
  >() // keyed by `${name}:${graphHash}`

  async createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
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
      deterministic: options?.deterministic,
      plannedSteps: options?.plannedSteps,
      wire,
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

    const step: StepState & { stepName: string } = {
      stepId,
      status: 'pending',
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay,
      createdAt: now,
      updatedAt: now,
      stepName,
    }

    const key = `${runId}:${stepName}`
    this.steps.set(key, step)
    this.stepData.set(stepId, { rpcName, data, stepName })

    // Add to history (same reference so mutations are reflected)
    const history = this.stepHistory.get(runId) || []
    history.push(step)
    this.stepHistory.set(runId, history)

    return step
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const key = `${runId}:${stepName}`
    const step = this.steps.get(key)
    if (!step) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
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

  async setStepChildRunId(stepId: string, childRunId: string): Promise<void> {
    for (const step of this.steps.values()) {
      if (step.stepId === stepId) {
        step.childRunId = childRunId
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

    const newStep: StepState & { stepName: string } = {
      stepId: newStepId,
      status,
      attemptCount: failedStep.attemptCount + 1,
      retries: failedStep.retries,
      retryDelay: failedStep.retryDelay,
      createdAt: now,
      updatedAt: now,
      stepName: stepName,
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

    // Add to history (same reference so mutations are reflected)
    const history = this.stepHistory.get(runId) || []
    history.push(newStep)
    this.stepHistory.set(runId, history)

    return newStep
  }

  async listRuns(options?: {
    workflowName?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<WorkflowRun[]> {
    let runs = Array.from(this.runs.values())
    if (options?.workflowName) {
      runs = runs.filter((r) => r.workflow === options.workflowName)
    }
    if (options?.status) {
      runs = runs.filter((r) => r.status === options.status)
    }
    runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? runs.length
    return runs.slice(offset, offset + limit)
  }

  async getRunSteps(
    runId: string
  ): Promise<
    Array<StepState & { stepName: string; rpcName?: string; data?: any }>
  > {
    const history = this.stepHistory.get(runId) || []
    return history.map((step) => {
      const stepDataEntry = this.stepData.get(step.stepId)
      return {
        ...step,
        rpcName: stepDataEntry?.rpcName ?? undefined,
        data: stepDataEntry?.data,
      }
    })
  }

  async getDistinctWorkflowNames(): Promise<string[]> {
    const names = new Set<string>()
    for (const run of this.runs.values()) {
      names.add(run.workflow)
    }
    return Array.from(names)
  }

  async deleteRun(id: string): Promise<boolean> {
    const existed = this.runs.has(id)
    this.runs.delete(id)
    this.stepHistory.delete(id)
    this.runState.delete(id)
    const prefix = `${id}:`
    for (const key of this.steps.keys()) {
      if (key.startsWith(prefix)) {
        const step = this.steps.get(key)
        if (step) {
          this.stepData.delete(step.stepId)
          this.branchKeys.delete(step.stepId)
        }
        this.steps.delete(key)
      }
    }
    return existed
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
    failedNodeIds: string[]
    branchKeys: Record<string, string>
  }> {
    const completedNodeIds: string[] = []
    const failedNodeIds: string[] = []
    const prefix = `${runId}:`
    for (const [key, step] of this.steps.entries()) {
      if (!key.startsWith(prefix)) continue
      const nodeId = key.substring(prefix.length)
      if (step.status === 'succeeded') {
        completedNodeIds.push(nodeId)
      } else if (step.status === 'failed') {
        const maxAttempts = (step.retries ?? 0) + 1
        if (step.attemptCount >= maxAttempts) {
          failedNodeIds.push(nodeId)
        }
      }
    }

    const branchKeys: Record<string, string> = {}
    for (const [stepId, branchKey] of this.branchKeys.entries()) {
      const stepData = this.stepData.get(stepId)
      if (stepData) {
        branchKeys[stepData.stepName] = branchKey
      }
    }

    return { completedNodeIds, failedNodeIds, branchKeys }
  }

  async getNodesWithoutSteps(
    runId: string,
    nodeIds: string[]
  ): Promise<string[]> {
    const existingSteps = new Set<string>()
    const prefix = `${runId}:`
    for (const [key] of this.steps.entries()) {
      if (key.startsWith(prefix)) {
        existingSteps.add(key.substring(prefix.length))
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
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void> {
    this.workflowVersions.set(`${name}:${graphHash}`, {
      graph,
      source,
      status: status ?? 'active',
    })
  }

  async updateWorkflowVersionStatus(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void> {
    const key = `${name}:${graphHash}`
    const version = this.workflowVersions.get(key)
    if (version) {
      version.status = status
    }
  }

  async getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    const version = this.workflowVersions.get(`${name}:${graphHash}`)
    if (!version) return null
    return { graph: version.graph, source: version.source }
  }

  async getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    const results: Array<{
      workflowName: string
      graphHash: string
      graph: any
    }> = []
    const prefix = agentName ? `ai:${agentName}:` : 'ai:'
    for (const [key, value] of this.workflowVersions) {
      if (value.source !== 'ai-agent' || value.status !== 'active') continue
      const separatorIdx = key.lastIndexOf(':')
      const wfName = key.substring(0, separatorIdx)
      const hash = key.substring(separatorIdx + 1)
      if (wfName.startsWith(prefix)) {
        results.push({
          workflowName: wfName,
          graphHash: hash,
          graph: value.graph,
        })
      }
    }
    return results
  }
}
