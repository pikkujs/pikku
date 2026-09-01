import { PikkuError, addError } from '../../errors/error-handler.js'
import type { ApprovalOutcome } from './workflow.types.js'

/**
 * Thrown to unwind a run that cannot continue on this tick. Not a failure:
 * the run resumes from its recorded step state.
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
 * Thrown inside a workflow step when the run has been cancelled, so the step
 * stops rather than finishing work nobody wants.
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

export class WorkflowSuspendedException extends Error {
  constructor(
    public readonly runId: string,
    public readonly reason: string
  ) {
    super(reason || 'Workflow suspended')
    this.name = 'WorkflowSuspendedException'
  }
}

export class WorkflowDispatchException extends Error {
  constructor(
    public readonly runId: string,
    public readonly stepName: string,
    options?: { cause?: unknown }
  ) {
    super(
      `Failed to dispatch workflow step '${stepName}' (run ${runId})`,
      options
    )
    this.name = 'WorkflowDispatchException'
  }
}

export class WorkflowNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Workflow not found: ${name}`)
  }
}
addError(WorkflowNotFoundError, {
  status: 404,
  message: 'Workflow not found.',
})

export class WorkflowRunNotFoundError extends PikkuError {
  constructor(runId: string) {
    super(`Workflow run not found: ${runId}`)
  }
}
addError(WorkflowRunNotFoundError, {
  status: 404,
  message: 'Workflow run not found.',
})

export class WorkflowRunFailedError extends PikkuError {
  public payload: { message?: string }
  constructor(message?: string) {
    super(`Workflow run failed: ${message ?? 'unknown'}`)
    this.payload = { message }
  }
}
addError(WorkflowRunFailedError, {
  status: 422,
  message: 'Workflow run failed.',
})

export class WorkflowRunCancelledError extends PikkuError {
  constructor() {
    super('Workflow was cancelled')
  }
}
addError(WorkflowRunCancelledError, {
  status: 409,
  message: 'Workflow was cancelled.',
})

export class WorkflowApprovalResolvedError extends PikkuError {
  public payload: {
    reason: string
    outcome: ApprovalOutcome<unknown>['status']
  }
  constructor(reason: string, outcome: ApprovalOutcome<unknown>['status']) {
    super(`Approval already ${outcome}: ${reason}`)
    this.payload = { reason, outcome }
  }
}
addError(WorkflowApprovalResolvedError, {
  status: 409,
  message: 'Approval has already been resolved.',
})

export class WorkflowStepFunctionMismatchError extends PikkuError {
  constructor(
    public readonly runId: string,
    public readonly stepName: string
  ) {
    super(
      `Workflow step '${stepName}' (run ${runId}) was dispatched with a different function`
    )
  }
}
addError(WorkflowStepFunctionMismatchError, {
  status: 409,
  message: 'Workflow step was dispatched with a different function.',
})

/**
 * Every dispatch that took this step lost its worker before finishing it, and
 * the step has no attempts left to hand out. Failing here is the loud end of
 * the loop: without it the step would be re-claimed and abandoned forever.
 */
export class WorkflowStepLeaseExpiredError extends PikkuError {
  constructor(
    public readonly runId: string,
    public readonly stepName: string,
    public readonly attemptCount: number
  ) {
    super(
      `Workflow step '${stepName}' (run ${runId}) lost its worker on every one of its ${attemptCount} attempts: the last lease expired with the step still running`
    )
  }
}
addError(WorkflowStepLeaseExpiredError, {
  status: 500,
  message: 'Workflow step lost its worker and has no attempts left.',
})

export class WorkflowStepNameNotString extends Error {
  constructor(stepName: unknown) {
    super(`Workflow step name must be a string. Received: ${typeof stepName}`)
  }
}
