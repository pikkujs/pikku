import { MissingSessionError } from '../../errors/errors.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import type { CoreUserSession, PikkuRawWire } from '../../types/core.types.js'
import { WorkflowNotFoundError } from './workflow-errors.js'
import { resolveWorkflowMeta } from './workflow-meta-resolver.js'
import { withRunProof } from './workflow-run-proof.js'
import {
  assertWorkflowRunOwner,
  WorkflowRunForbiddenError,
} from './workflow-run-ownership.js'
import type { WorkflowRun, WorkflowRunWire } from './workflow.types.js'

/** The part of a function's wire these checks read: who is calling, and over what. */
export type WorkflowCallerWire = Pick<
  Partial<PikkuRawWire>,
  'session' | 'getSession' | 'pikkuUserId' | 'wireType' | 'wireId'
>

const callerSession = async (
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

/** The workflow's meta and function, or a 404 when there is no such workflow. */
const declaredWorkflow = (workflowName: string) => {
  const resolved = resolveWorkflowMeta(workflowName)
  if (!resolved) throw new WorkflowNotFoundError(workflowName)
  const { meta, packageName } = resolved
  const funcId = meta.pikkuFuncId
  const funcConfig = funcId
    ? pikkuState(packageName, 'function', 'functions').get(funcId)
    : undefined
  return { meta, packageName, funcId, funcConfig }
}

type DeclaredWorkflow = ReturnType<typeof declaredWorkflow>

/**
 * Runs the workflow's own declaration through the function pipeline, without
 * its body. A graph has no function, so `auth` is its whole declaration. A
 * queued workflow's function may live in another deploy unit: then only `auth`
 * can be judged here, the run does the rest, and `complete` stays false.
 */
const checkDeclaration = async <Data>(
  workflow: DeclaredWorkflow,
  workflowName: string,
  wire: WorkflowCallerWire,
  data: Data,
  gate: 'start' | 'run'
): Promise<{ data: Data; complete: boolean }> => {
  const session = await callerSession(wire)
  const { meta, funcId, funcConfig, packageName } = workflow
  if (!funcId || !funcConfig) {
    if (meta.auth !== false && !session) {
      throw new MissingSessionError('Authentication required')
    }
    return { data, complete: meta.source === 'graph' }
  }
  const checked = await runPikkuFunc<Data, Data>(
    'workflow',
    workflowName,
    funcId,
    {
      singletonServices: getSingletonServices()!,
      wire: { ...wire, session } as PikkuRawWire,
      data: () => data,
      packageName,
      gate,
    }
  )
  return { data: checked, complete: true }
}

/**
 * The check made before a route starts a run, so a refused call leaves no run
 * behind: the workflow's `auth`, scopes, input schema and permissions, against
 * the caller's real session. `expose` is not judged here; `rpc.exposedWorkflow`
 * does that before it calls this.
 *
 * Returns the input with its schema defaults applied, and the wire to start the
 * run with. `rpc.startWorkflow` itself never comes through here.
 */
export const checkWorkflowStart = async (
  workflowName: string,
  input: unknown,
  wire: WorkflowCallerWire
): Promise<{ input: any; wire: WorkflowRunWire }> => {
  const workflow = declaredWorkflow(workflowName)
  const { data, complete } = await checkDeclaration(
    workflow,
    workflowName,
    wire,
    input,
    'start'
  )
  const session = await callerSession(wire)
  const pikkuUserId = wire.pikkuUserId ?? session?.userId
  const runWire: WorkflowRunWire = {
    type: wire.wireType ?? 'unknown',
    id: wire.wireId,
    ...(pikkuUserId ? { pikkuUserId } : {}),
  }
  return {
    input: data,
    wire: complete ? withRunProof(runWire, 'start', workflowName) : runWire,
  }
}

/**
 * The check on a route that reads or answers a run, which never calls the
 * workflow's function. The run must be the named workflow's own; then the workflow's `auth`, scopes and permissions are run with the run's
 * stored input, so one `pikkuPermission` covers the start and the read.
 *
 * To read: a run with an owner is only for that owner. An ownerless run is
 * readable on an `auth: false` workflow, or where the workflow's permissions
 * just allowed it, and nowhere else.
 *
 * To answer: a session is always required, and `approvers` on
 * `workflow.approval()` decides, so an approver need not own the run.
 */
export const checkWorkflowRunAccess = async (
  workflowName: string,
  run: WorkflowRun | null | undefined,
  wire: WorkflowCallerWire,
  action: 'read' | 'approve'
): Promise<void> => {
  const workflow = declaredWorkflow(workflowName)
  if (!run || run.workflow !== workflowName) {
    throw new WorkflowNotFoundError(workflowName)
  }
  const session = await callerSession(wire)
  if (action === 'approve' && !session) {
    throw new MissingSessionError('Authentication required')
  }
  await checkDeclaration(workflow, workflowName, wire, run.input, 'run')
  if (action === 'approve') return

  if (run.wire?.pikkuUserId) {
    assertWorkflowRunOwner(run.wire, session)
    return
  }
  const open = workflow.meta.auth === false
  if (!open && !workflow.funcConfig?.permissions) {
    throw new WorkflowRunForbiddenError()
  }
}
