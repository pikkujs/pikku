import type { CoreWorkflow } from './workflow.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
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
 * Register a workflow with the system
 */
export const wireWorkflow = <
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    any,
    any,
    any
  > = CorePikkuFunctionConfig<any, any, any>,
>(
  workflow: CoreWorkflow<PikkuFunctionConfig>
) => {
  // Get workflow metadata from inspector
  const meta = pikkuState('workflows', 'meta')
  const workflowMeta = meta[workflow.name]
  if (!workflowMeta) {
    throw new Error(
      `Workflow metadata not found for '${workflow.name}'. Make sure to run the CLI to generate metadata.`
    )
  }

  // Register the function with pikku
  addFunction(workflowMeta.pikkuFuncName, {
    func: workflow.func.func,
    auth: workflow.func.auth,
    permissions: workflow.func.permissions,
    middleware: workflow.func.middleware as any,
    tags: workflow.func.tags,
    docs: workflow.func.docs as any,
  })

  // Store workflow definition in state
  const registrations = pikkuState('workflows', 'registrations')
  registrations.set(workflow.name, workflow)
}
