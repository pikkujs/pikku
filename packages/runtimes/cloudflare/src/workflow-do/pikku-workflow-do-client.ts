import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import type { SerializedError } from '@pikku/core'
import type { WorkflowService } from '@pikku/core'
import { buildRunTimeline, reconstructStateAt } from '@pikku/core/workflow'
import type {
  RunTimeline,
  ReconstructedRunState,
  StepState,
  WorkflowPlannedStep,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowRunWire,
  WorkflowStatus,
  WorkflowVersionStatus,
} from '@pikku/core/workflow'

interface DoStub {
  start<I>(input: {
    workflow: string
    input: I
    wire?: WorkflowRunWire
    graphHash?: string
    inline?: boolean
  }): Promise<{ runId: string }>
  getRun(): Promise<WorkflowRun | null>
  getRunStatus(): Promise<WorkflowRunStatus | null>
  getRunHistory(): Promise<Array<StepState & { stepName: string }>>
  cancel(reason?: string): Promise<void>
}

const notSupported = (method: string): never => {
  throw new Error(
    `PikkuWorkflowDoClient.${method}: not supported in DO client mode — call directly on the workflow DO instance`
  )
}

/**
 * `WorkflowService` implementation that proxies to a per-run
 * `PikkuWorkflowDO` over the `WORKFLOW_DO` namespace binding.
 *
 * Used by adapter-generated CF Worker entries (gateway + workflow units)
 * to satisfy the singleton `workflowService` slot when workflows execute
 * inside Durable Objects rather than queue/D1.
 *
 * Only the run-lifecycle methods used by user-facing RPC paths are
 * implemented:
 *   - `startWorkflow` — mints a new DO id, forwards to `stub.start`
 *   - `getRun`, `getRunStatus`, `getRunHistory` — proxy to the DO
 *   - `updateRunStatus('cancelled', ...)` — proxies to `stub.cancel`
 *
 * All other `WorkflowService` methods (orchestration, step state,
 * versioning, replay) live INSIDE the DO and are unreachable from the
 * client — calling them throws.
 */
export class PikkuWorkflowDoClient implements WorkflowService {
  constructor(private readonly ns: DurableObjectNamespace) {}

  private getStub(runId: string): DoStub {
    const id = this.ns.idFromString(runId)
    return this.ns.get(id) as unknown as DoStub
  }

  async startWorkflow<I>(
    name: string,
    input: I,
    wire: WorkflowRunWire,
    _rpcService: any,
    options?: { inline?: boolean; startNode?: string }
  ): Promise<{ runId: string }> {
    const id = this.ns.newUniqueId()
    const runId = id.toString()
    const stub = this.ns.get(id) as unknown as DoStub
    await stub.start<I>({
      workflow: name,
      input,
      wire: { ...wire, id: runId },
      inline: options?.inline,
    })
    return { runId }
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    return this.getStub(id).getRun()
  }

  async getRunStatus(id: string): Promise<WorkflowRunStatus | null> {
    return this.getStub(id).getRunStatus()
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    return this.getStub(runId).getRunHistory()
  }

  async getRunTimeline(id: string): Promise<RunTimeline | null> {
    const run = await this.getRun(id)
    if (!run) return null
    return buildRunTimeline(await this.getRunHistory(id))
  }

  async reconstructRunStateAt(
    id: string,
    at?: number | Date
  ): Promise<ReconstructedRunState | null> {
    const timeline = await this.getRunTimeline(id)
    if (!timeline) return null
    return reconstructStateAt(timeline, at ?? timeline.length - 1)
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    _output?: any,
    error?: SerializedError
  ): Promise<void> {
    if (status === 'cancelled') {
      await this.getStub(id).cancel(error?.message)
      return
    }
    notSupported('updateRunStatus')
  }

  async close(): Promise<void> {}

  // ── Methods that only make sense inside the DO ────────────────────

  createRun(
    _workflowName: string,
    _input: any,
    _inline: boolean,
    _graphHash: string,
    _wire: WorkflowRunWire,
    _options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<string> {
    return Promise.reject(notSupported('createRun'))
  }

  withRunLock<T>(_id: string, _fn: () => Promise<T>): Promise<T> {
    return Promise.reject(notSupported('withRunLock'))
  }

  resumeWorkflow(_runId: string): Promise<void> {
    return Promise.reject(notSupported('resumeWorkflow'))
  }

  approveStep(
    _runId: string,
    _reason: string,
    _decision: unknown
  ): Promise<void> {
    return Promise.reject(notSupported('approveStep'))
  }

  async runToCompletion<I>(
    _name: string,
    _input: I,
    _rpcService: any,
    _options?: { pollIntervalMs?: number; wire?: WorkflowRunWire }
  ): Promise<unknown> {
    return notSupported('runToCompletion')
  }

  runWorkflowJob(_runId: string, _rpcService: any): Promise<void> {
    return Promise.reject(notSupported('runWorkflowJob'))
  }

  orchestrateWorkflow(_runId: string, _rpcService: any): Promise<void> {
    return Promise.reject(notSupported('orchestrateWorkflow'))
  }

  executeWorkflowSleepCompleted(
    _runId: string,
    _stepId: string
  ): Promise<void> {
    return Promise.reject(notSupported('executeWorkflowSleepCompleted'))
  }

  insertStepState(
    _runId: string,
    _stepName: string,
    _rpcName: string,
    _data: any,
    _stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState> {
    return Promise.reject(notSupported('insertStepState'))
  }

  getStepState(_runId: string, _stepName: string): Promise<StepState> {
    return Promise.reject(notSupported('getStepState'))
  }

  setStepRunning(_stepId: string): Promise<void> {
    return Promise.reject(notSupported('setStepRunning'))
  }

  setStepScheduled(_stepId: string): Promise<void> {
    return Promise.reject(notSupported('setStepScheduled'))
  }

  setStepResult(_stepId: string, _result: any): Promise<void> {
    return Promise.reject(notSupported('setStepResult'))
  }

  setStepChildRunId(_stepId: string, _childRunId: string): Promise<void> {
    return Promise.reject(notSupported('setStepChildRunId'))
  }

  setStepError(_stepId: string, _error: Error): Promise<void> {
    return Promise.reject(notSupported('setStepError'))
  }

  createRetryAttempt(
    _stepId: string,
    _status: 'pending' | 'running'
  ): Promise<StepState> {
    return Promise.reject(notSupported('createRetryAttempt'))
  }

  executeWorkflowStep(
    _runId: string,
    _stepName: string,
    _rpcName: string | null,
    _data: any,
    _rpcService: any
  ): Promise<void> {
    return Promise.reject(notSupported('executeWorkflowStep'))
  }

  upsertWorkflowVersion(
    _name: string,
    _graphHash: string,
    _graph: any,
    _source: string,
    _status?: WorkflowVersionStatus
  ): Promise<void> {
    return Promise.reject(notSupported('upsertWorkflowVersion'))
  }

  updateWorkflowVersionStatus(
    _name: string,
    _graphHash: string,
    _status: WorkflowVersionStatus
  ): Promise<void> {
    return Promise.reject(notSupported('updateWorkflowVersionStatus'))
  }

  getWorkflowVersion(
    _name: string,
    _graphHash: string
  ): Promise<{ graph: any; source: string } | null> {
    return Promise.reject(notSupported('getWorkflowVersion'))
  }

  getAIGeneratedWorkflows(
    _agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>> {
    return Promise.reject(notSupported('getAIGeneratedWorkflows'))
  }
}
