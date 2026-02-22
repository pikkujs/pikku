import {
  SerializedError,
  CoreSingletonServices,
  CreateWireServices,
  CoreConfig,
} from '../types/core.types.js'
import {
  WorkflowRun,
  StepState,
  WorkflowStatus,
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
    graphHash: string
  ): Promise<string>
  getRun(id: string): Promise<WorkflowRun | null>
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
  setServices(
    singletonServices: CoreSingletonServices,
    createWireServices: CreateWireServices | undefined,
    config: CoreConfig
  ): void
  startWorkflow<I>(
    name: string,
    input: I,
    rpcService: any,
    options?: { inline?: boolean; startNode?: string }
  ): Promise<{ runId: string }>
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
    source: string
  ): Promise<void>
  getWorkflowVersion(
    name: string,
    graphHash: string
  ): Promise<{ graph: any; source: string } | null>
}
