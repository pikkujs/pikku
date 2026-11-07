import { MissingSessionError } from '../../errors/errors.js'
import { getSingletonServices } from '../../pikku-state.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type {
  WorkflowRunProof,
  WorkflowRunWire,
  WorkflowRuntimeMeta,
} from './workflow.types.js'

/**
 * Private to this module, so nothing that arrives as data can carry it: JSON
 * has no symbols, and no caller of `rpc.startWorkflow` can name this one.
 */
const RUN_PROOF = Symbol('pikku.workflow.run-proof')

type ProvenWire = WorkflowRunWire & {
  [RUN_PROOF]?: { proof: WorkflowRunProof; workflowName: string }
}

/** Marks a wire so the run created from it records `proof`. Only for this workflow. */
export const withRunProof = (
  wire: WorkflowRunWire,
  proof: WorkflowRunProof,
  workflowName: string
): WorkflowRunWire => {
  const proven: ProvenWire = { ...wire, [RUN_PROOF]: { proof, workflowName } }
  return proven
}

/** Whether this wire came from a check inside core, for this workflow. */
export const hasRunProof = (
  wire: WorkflowRunWire | undefined,
  workflowName: string
): boolean => (wire as ProvenWire)?.[RUN_PROOF]?.workflowName === workflowName

/**
 * A graph has no function to run, so a start that did not come through
 * `checkWorkflowStart` applies its `auth` here: unset needs a session, reloaded
 * for the run's owner the way a workflow body reloads one.
 */
export const assertGraphSession = async (
  name: string,
  meta: WorkflowRuntimeMeta,
  wire: WorkflowRunWire
): Promise<void> => {
  if (meta.auth === false || hasRunProof(wire, name)) return
  const session =
    wire.pikkuUserId &&
    (await getSingletonServices()?.sessionStore?.get(wire.pikkuUserId))
  if (!session) throw new MissingSessionError('Authentication required')
}

/**
 * What a run row stores. `verified` is written from the private marker alone,
 * and any value a caller put on the wire is dropped.
 *
 * knowledge: decisions/security/a-checked-start-proves-the-owner-of-a-run-without-a-session-store.md
 */
export const settleRunWire = (
  workflowName: string,
  wire: WorkflowRunWire
): WorkflowRunWire => {
  const proof = (wire as ProvenWire)[RUN_PROOF]
  const settled: ProvenWire = { ...wire }
  delete settled[RUN_PROOF]
  delete settled.verified
  if (proof?.workflowName === workflowName && settled.pikkuUserId) {
    settled.verified = proof.proof
  }
  return settled
}

/**
 * The identity a proven run stands on when the app has no session store: the
 * user id and nothing else, so scopes and any permission reading other session
 * fields refuse. An app with a store always reloads the real session, and one
 * it no longer holds is refused as it always was.
 */
export const provenRunSession = (
  wire: WorkflowRunWire | undefined
): CoreUserSession | undefined =>
  wire?.verified && wire.pikkuUserId && !getSingletonServices()?.sessionStore
    ? { userId: wire.pikkuUserId }
    : undefined

/** The identity fields of a step's wire, for the run the step belongs to. */
export const runIdentityWire = (
  wire: WorkflowRunWire | undefined
): { pikkuUserId?: string; session?: CoreUserSession } => {
  const session = provenRunSession(wire)
  return {
    ...(wire?.pikkuUserId ? { pikkuUserId: wire.pikkuUserId } : {}),
    ...(session ? { session } : {}),
  }
}

/** The wire of a child run: a proven parent proves the owner, not the child's own gates. */
export const childRunWire = (
  parentWire: WorkflowRunWire | undefined,
  wire: WorkflowRunWire,
  workflowName: string
): WorkflowRunWire =>
  parentWire?.verified ? withRunProof(wire, 'parent', workflowName) : wire
