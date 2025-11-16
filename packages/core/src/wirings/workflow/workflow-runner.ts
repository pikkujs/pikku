import { pikkuState } from '../../pikku-state.js'
import { PikkuError } from '../../errors/error-handler.js'
import { addFunction } from '../../function/function-runner.js'

/**
 * Exception thrown when workflow needs to pause for async step
 */
export class WorkflowAsyncException extends Error {
  constructor(
    public readonly runId: string,
    public readonly stepName: string
  ) {
    super(`Workflow paused at step: ${stepName}`)
    this.name = 'WorkflowAsyncException'
  }
}

/**
 * Exception thrown when workflow is cancelled
 */
export class WorkflowCancelledException extends Error {
  constructor(
    public readonly runId: string,
    public readonly reason?: string
  ) {
    super(reason || 'Workflow cancelled')
    this.name = 'WorkflowCancelledException'
  }
}

/**
 * Error class for workflow not found
 */
export class WorkflowNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Workflow not found: ${name}`)
  }
}

/**
 * Error class for workflow not found
 */
export class WorkflowRunNotFound extends PikkuError {
  constructor(runId: string) {
    super(`Workflow run not found: ${runId}`)
  }
}

/**
 * Add a workflow to the system
 * This is called by the generated workflow wirings
 */
export const addWorkflow = (workflowName: string, workflowFunc: any) => {
  // Get workflow metadata from inspector
  const meta = pikkuState('workflows', 'meta')
  const workflowMeta = meta[workflowName]
  if (!workflowMeta) {
    throw new Error(
      `Workflow metadata not found for '${workflowName}'. Make sure to run the CLI to generate metadata.`
    )
  }

  // Store workflow definition in state
  const registrations = pikkuState('workflows', 'registrations')
  registrations.set(workflowName, {
    name: workflowName,
    func: workflowFunc,
  })

  // Register the function with pikku
  addFunction(workflowMeta.pikkuFuncName, workflowFunc)
}
