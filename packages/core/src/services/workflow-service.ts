import type { SerializedError } from '../types/core.types.js'
import type {
  WorkflowRun,
  WorkflowPlannedStep,
  WorkflowRunWire,
  WorkflowRunStatus,
  StepState,
  WorkflowStatus,
  WorkflowVersionStatus,
} from '../wirings/workflow/workflow.types.js'

/**
 * Interface for workflow orchestration
 * Handles workflow execution, replay, orchestration logic, and run-level state
 */
export interface WorkflowService {
  // Run-level state operations
  createRun(
    workflowName: string,
    input: any,
    inline: boolean,
    graphHash: string,
    wire: WorkflowRunWire,
    options?: {
      deterministic?: boolean
      plannedSteps?: WorkflowPlannedStep[]
    }
  ): Promise<string>
  getRun(id: string): Promise<WorkflowRun | null>
  getRunStatus(id: string): Promise<WorkflowRunStatus | null>
  getRunHistory(runId: string): Promise<Array<StepState & { stepName: string }>>
  updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void>
  withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T>
  close(): Promise<void>

  // Orchestration operations
  resumeWorkflow(runId: string): Promise<void>
  startWorkflow<I>(
    name: string,
    input: I,
    wire: WorkflowRunWire,
    rpcService: any,
    options?: { inline?: boolean; startNode?: string }
  ): Promise<{ runId: string }>
  runToCompletion<I>(
    name: string,
    input: I,
    rpcService: any,
    options?: { pollIntervalMs?: number; wire?: WorkflowRunWire }
  ): Promise<unknown>
  runWorkflowJob(runId: string, rpcService: any): Promise<void>
  orchestrateWorkflow(runId: string, rpcService: any): Promise<void>
  executeWorkflowSleepCompleted(runId: string, stepId: string): Promise<void>

  // Step-level state operations
  insertStepState(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState>
  getStepState(runId: string, stepName: string): Promise<StepState>
  setStepRunning(stepId: string): Promise<void>
  setStepScheduled(stepId: string): Promise<void>
  setStepResult(stepId: string, result: any): Promise<void>
  setStepChildRunId(stepId: string, childRunId: string): Promise<void>
  setStepError(stepId: string, error: Error): Promise<void>
  createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState>

  // Step execution
  executeWorkflowStep(
    runId: string,
    stepName: string,
    rpcName: string | null,
    data: any,
    rpcService: any
  ): Promise<void>

  // Version operations
  upsertWorkflowVersion(
    name: string,
    graphHash: string,
    graph: any,
    source: string,
    status?: WorkflowVersionStatus
  ): Promise<void>
  updateWorkflowVersionStatus(
    name: string,
    graphHash: string,
    status: WorkflowVersionStatus
  ): Promise<void>
  getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null>

  getAIGeneratedWorkflows(
    agentName?: string
  ): Promise<Array<{ workflowName: string; graphHash: string; graph: any }>>
}
