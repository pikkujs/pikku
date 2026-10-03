/**
 * A suspended workflow run is stored with an `error` row even though nothing has
 * gone wrong: core puts the suspend reason in `error.message` and tags it with a
 * code (see PikkuWorkflowService.updateRunStatus call sites). Presenting that as
 * a failure is wrong — the run is healthy and waiting.
 */

export type WorkflowRunErrorLike = { message?: unknown; code?: string }

/** `error.code` values core attaches to a run it suspended rather than failed. */
export const SUSPEND_ERROR_CODES = ['WORKFLOW_SUSPENDED', 'RPC_NOT_FOUND']

/**
 * True when a run's `error` is really a suspend reason. Checks the status too,
 * so a genuinely failed run that happens to carry one of these codes is still
 * reported as a failure.
 */
export const isSuspendReason = (
  status: string | undefined,
  error: WorkflowRunErrorLike | undefined
): boolean =>
  status === 'suspended' &&
  !!error &&
  (error.code === undefined || SUSPEND_ERROR_CODES.includes(error.code))

/**
 * What to tell the operator about a suspended run. The two codes need different
 * copy because they need different actions: one is waiting on a person, the
 * other is waiting on a deploy.
 */
export const suspendReasonCopy = (
  error: WorkflowRunErrorLike | undefined
): { title: string; hint?: string } => {
  if (error?.code === 'RPC_NOT_FOUND') {
    return {
      title: 'Waiting on a missing function',
      hint: 'Deploy the function below, then resume the run.',
    }
  }
  return {
    title: 'Waiting to be resumed',
    hint: 'This run is paused and will continue once it is resumed.',
  }
}

/** The suspend reason text, tolerating a non-string message. */
export const suspendReasonText = (
  error: WorkflowRunErrorLike | undefined
): string => {
  if (!error) return ''
  return typeof error.message === 'string'
    ? error.message
    : JSON.stringify(error.message ?? error, null, 2)
}
