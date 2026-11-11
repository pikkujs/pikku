import { MissingSessionError } from '../../errors/errors.js'
import type { CoreUserSession, PikkuRawWire } from '../../types/core.types.js'
import { WorkflowNotFoundError } from './workflow-errors.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import {
  assertWorkflowRunOwner,
  WorkflowRunForbiddenError,
} from './workflow-run-ownership.js'
import type { WorkflowRun } from './workflow.types.js'

/** The part of a function's wire these checks read: who is calling, and over what. */
export type WorkflowCallerWire = Pick<
  Partial<PikkuRawWire>,
  'session' | 'getSession' | 'pikkuUserId' | 'wireType' | 'wireId'
>

export const callerSession = async (
  wire: WorkflowCallerWire
): Promise<CoreUserSession | undefined> =>
  typeof wire.getSession === 'function' ? await wire.getSession() : wire.session

/**
 * The expose gate of `rpc.exposedWorkflow`, the entry a generated route calls.
 * Only `expose: true` opens a workflow to a route; anything else is a 404, so
 * names cannot be probed. `rpc.startWorkflow` never comes through here.
 */
export const assertWorkflowExposed = (workflowName: string): void => {
  if (resolveWorkflowMeta(workflowName)?.meta.expose !== true) {
    throw new WorkflowNotFoundError(workflowName)
  }
}

/**
 * Who may read or answer a run. This is the read and approve routes' own check
 * on the run, not a check made for the workflow: the workflow's `auth`, scopes
 * and permissions are judged when its function runs, and nowhere else.
 *
 * The run must be the named workflow's own. To read: a run with an owner is
 * only for that owner, and an ownerless run is readable only on an
 * `auth: false` workflow. To answer: a session is always required, and
 * `approvers` on `workflow.approval()` decides, so an approver need not own the
 * run.
 */
export const checkWorkflowRunAccess = async (
  workflowName: string,
  run: WorkflowRun | null | undefined,
  wire: WorkflowCallerWire,
  action: 'read' | 'approve'
): Promise<void> => {
  const resolved = resolveWorkflowMeta(workflowName)
  if (!resolved) throw new WorkflowNotFoundError(workflowName)
  if (!run || run.workflow !== workflowName) {
    throw new WorkflowNotFoundError(workflowName)
  }
  const session = await callerSession(wire)
  if (action === 'approve') {
    if (!session) throw new MissingSessionError('Authentication required')
    return
  }
  if (resolved.meta.auth !== false && !session) {
    throw new MissingSessionError('Authentication required')
  }
  if (run.wire?.pikkuUserId) {
    assertWorkflowRunOwner(run.wire, session)
    return
  }
  if (resolved.meta.auth !== false) throw new WorkflowRunForbiddenError()
}
